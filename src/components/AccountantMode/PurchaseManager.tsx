import React, { useState, useEffect } from 'react';
import { 
  ShoppingBag, Plus, 
  Trash2, Users, Landmark, X
} from 'lucide-react';
import { db } from '../../utils/db';
import { generateId } from '../../utils/ledgerEngine';

export const PurchaseManager: React.FC = () => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'FAKTUR' | 'ORDER' | 'DP' | 'PEMASOK'>('FAKTUR');
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  
  // Modal Form State
  const [showModal, setShowModal] = useState(false);
  const [docType, setDocType] = useState<'ORDER' | 'RECEIPT' | 'INVOICE' | 'RETURN'>('INVOICE');
  const [contactId, setContactId] = useState('v-01');
  const [referenceId, setReferenceId] = useState('');
  const [items, setItems] = useState<any[]>([
    { productId: '', qty: 1, price: 0, discount: 0 }
  ]);
  const [dpApplied, setDpApplied] = useState(0);

  // Vendor Modal State
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');

  // Perintah Pembayaran (Payment Order / Approval Checklist)
  const [pendingPayments, setPendingPayments] = useState<number>(0);
  const [totalSpent, setTotalSpent] = useState<number>(0);

  const handleAddVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVendorName.trim()) return;

    const newId = generateId('v');
    const newContact = {
      id: newId,
      name: newVendorName,
      type: 'VENDOR' as const
    };

    try {
      await db.contacts.add(newContact);
      setNewVendorName('');
      setShowVendorModal(false);
      
      const event = new CustomEvent('db-update');
      window.dispatchEvent(event);
      
      fetchData();
    } catch (err) {
      console.error(err);
      alert('Gagal menambahkan pemasok baru.');
    }
  };

  const fetchData = async () => {
    try {
      const [docList, prodList, contactList] = await Promise.all([
        db.purchaseDocuments.toArray(),
        db.products.toArray(),
        db.contacts.toArray()
      ]);
      setDocuments(docList);
      setProducts(prodList);
      setContacts(contactList.filter(c => c.type === 'VENDOR'));

      // Hitung spending total & pending payment
      const spent = docList
        .filter(d => d.type === 'INVOICE' && d.status === 'COMPLETED')
        .reduce((sum, d) => sum + d.totalAmount, 0);
      setTotalSpent(spent);

      const pending = docList
        .filter(d => d.type === 'INVOICE' && d.status === 'PENDING')
        .reduce((sum, d) => sum + d.totalAmount, 0);
      setPendingPayments(pending);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddItem = () => {
    setItems([...items, { productId: '', qty: 1, price: 0, discount: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index][field] = value;
    
    // Auto fill cost price jika productId berubah
    if (field === 'productId') {
      const p = products.find(prod => prod.id === value);
      if (p) {
        newItems[index].price = p.averageCost;
      }
    }
    setItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.some(item => !item.productId)) {
      alert('Pilih produk untuk semua baris item');
      return;
    }

    const docId = generateId(docType === 'INVOICE' ? 'PINV' : 'PDOC');
    const totalBeforePpn = items.reduce((sum, item) => {
      const lineTotal = item.qty * item.price * (1 - item.discount / 100);
      return sum + lineTotal;
    }, 0);

    const finalDoc = {
      id: docId,
      date: new Date().toISOString().split('T')[0],
      contactId,
      type: docType,
      status: docType === 'INVOICE' ? 'COMPLETED' : 'PENDING',
      referenceId: referenceId || undefined,
      totalAmount: totalBeforePpn,
      dpApplied,
      items: items.map(i => ({
        documentId: docId,
        productId: i.productId,
        qty: Number(i.qty),
        price: Number(i.price),
        discount: Number(i.discount)
      }))
    };

    try {
      await db.purchaseDocuments.add(finalDoc);
      setShowModal(false);
      // Reset form
      setItems([{ productId: '', qty: 1, price: 0, discount: 0 }]);
      setReferenceId('');
      setDpApplied(0);
      // Trigger update global
      const event = new CustomEvent('db-update');
      window.dispatchEvent(event);
      fetchData();
    } catch (err) {
      console.error(err);
      alert('Gagal menyimpan dokumen pembelian.');
    }
  };

  const getFilteredDocs = () => {
    switch (activeSubTab) {
      case 'FAKTUR':
        return documents.filter(d => d.type === 'INVOICE');
      case 'ORDER':
        return documents.filter(d => d.type === 'ORDER' || d.type === 'RECEIPT');
      case 'DP':
        return documents.filter(d => d.dpApplied > 0);
      default:
        return documents;
    }
  };

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', color: '#f3f4f6' }}>
      
      {/* Purchase Analytics Widgets */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
        <div 
          className="glass-card hover-scale hover-glow-rose"
          onMouseEnter={() => setHoveredCard('spent')}
          onMouseLeave={() => setHoveredCard(null)}
          style={{ 
            padding: '18px', 
            background: hoveredCard === 'spent'
              ? 'rgba(20, 20, 24, 0.9)'
              : 'rgba(10, 10, 12, 0.8)', 
            border: '1px solid rgba(239, 68, 68, 0.25)', 
            borderRadius: '10px' 
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '10px', color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>Belanja Bulan Ini</span>
            <ShoppingBag size={15} style={{ color: '#fca5a5' }} />
          </div>
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '700', letterSpacing: '-0.3px', color: '#ff8a8a' }}>
            Rp {totalSpent.toLocaleString('id-ID')}
          </h3>
          <span style={{ fontSize: '10px', color: '#6b7280', marginTop: '14px', display: 'block' }}>Nilai transaksi pembelian final</span>
        </div>

        <div 
          className="glass-card hover-scale hover-glow-rose"
          onMouseEnter={() => setHoveredCard('pending')}
          onMouseLeave={() => setHoveredCard(null)}
          style={{ 
            padding: '18px', 
            background: hoveredCard === 'pending'
              ? 'rgba(20, 20, 24, 0.9)'
              : 'rgba(10, 10, 12, 0.8)', 
            border: '1px solid rgba(245, 158, 11, 0.25)', 
            borderRadius: '10px' 
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '10px', color: '#fde047', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>Perintah Bayar Pending</span>
            <Landmark size={15} style={{ color: '#fde047' }} />
          </div>
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '700', letterSpacing: '-0.3px', color: '#fbbf24' }}>
            Rp {pendingPayments.toLocaleString('id-ID')}
          </h3>
          <span style={{ fontSize: '10px', color: '#6b7280', marginTop: '14px', display: 'block' }}>Tagihan terverifikasi belum dibayar</span>
        </div>

        <div 
          className="glass-card hover-scale hover-glow-violet"
          onMouseEnter={() => setHoveredCard('supplier')}
          onMouseLeave={() => setHoveredCard(null)}
          style={{ 
            padding: '18px', 
            background: hoveredCard === 'supplier'
              ? 'rgba(20, 20, 24, 0.9)'
              : 'rgba(10, 10, 12, 0.8)',
            border: '1px solid rgba(139, 92, 246, 0.25)', 
            borderRadius: '10px' 
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '10px', color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>Supplier / Vendor</span>
            <Users size={15} style={{ color: '#93c5fd' }} />
          </div>
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '700', letterSpacing: '-0.3px', color: '#ffffff' }}>
            {contacts.length} Pemasok
          </h3>
          <span style={{ fontSize: '10px', color: '#6b7280', marginTop: '14px', display: 'block' }}>Terdaftar secara offline</span>
        </div>
      </div>

      {/* Sub Tabs Pembelian */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-table)', paddingBottom: '8px', marginTop: '4px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['FAKTUR', 'ORDER', 'DP', 'PEMASOK'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveSubTab(tab)}
              style={{
                background: activeSubTab === tab ? 'var(--bg-tab-active)' : 'transparent',
                border: 'none',
                color: activeSubTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: activeSubTab === tab ? '600' : '400',
                transition: 'all 0.15s ease'
              }}
            >
              {tab === 'FAKTUR' && 'Faktur Pembelian'}
              {tab === 'ORDER' && 'Pesanan & Penerimaan'}
              {tab === 'DP' && 'Uang Muka'}
              {tab === 'PEMASOK' && 'Pemasok / Vendor'}
            </button>
          ))}
        </div>
        {activeSubTab === 'PEMASOK' ? (
          <button
            onClick={() => setShowVendorModal(true)}
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: 'white',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
              transition: 'all 0.2s ease'
            }}
            className="hover-scale"
          >
            <Plus size={13} />
            Tambah Pemasok
          </button>
        ) : (
          <button
            onClick={() => setShowModal(true)}
            style={{
              background: 'linear-gradient(135deg, #e11d48, #f43f5e)',
              color: 'white',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 12px rgba(225, 29, 72, 0.25)',
              transition: 'all 0.2s ease'
            }}
            className="hover-scale"
          >
            <Plus size={13} />
            Buat Transaksi Pembelian
          </button>
        )}
      </div>

      {/* TAMPILAN PEMASOK */}
      {activeSubTab === 'PEMASOK' ? (
        <div className="table-responsive data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID Vendor</th>
                <th>Nama Pemasok</th>
                <th>Tipe</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => (
                <tr key={c.id}>
                  <td className="td-muted">{c.id}</td>
                  <td className="td-primary">{c.name}</td>
                  <td>
                    <span className="badge-glow badge-glow-danger">
                      {c.type}
                    </span>
                  </td>
                  <td>
                    <span className="badge-glow badge-glow-success">Aktif</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* TAMPILAN DOKUMEN */
        <div className="table-responsive data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>No. Dokumen</th>
                <th>Tanggal</th>
                <th>Pemasok</th>
                <th>Tipe</th>
                <th>Uang Muka</th>
                <th>Nilai (DPP)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {getFilteredDocs().length === 0 ? (
                <tr>
                  <td colSpan={7} className="td-empty">
                    Belum ada riwayat transaksi pembelian.
                  </td>
                </tr>
              ) : (
                getFilteredDocs().map(doc => {
                  const supplier = contacts.find(c => c.id === doc.contactId)?.name || doc.contactId;
                  return (
                    <tr key={doc.id}>
                      <td className="td-primary">{doc.id}</td>
                      <td className="td-muted">{doc.date}</td>
                      <td>{supplier}</td>
                      <td>
                        <span className={`badge-glow ${doc.type === 'INVOICE' ? 'badge-glow-success' : 'badge-glow-warning'}`}>
                          {doc.type}
                        </span>
                      </td>
                      <td style={{ color: 'var(--color-dp-amount)', fontFamily: 'monospace' }}>
                        {doc.dpApplied > 0 ? `Rp ${doc.dpApplied.toLocaleString('id-ID')}` : '-'}
                      </td>
                      <td className="td-mono">
                        Rp {doc.totalAmount.toLocaleString('id-ID')}
                      </td>
                      <td>
                        <span className={`badge-glow ${doc.status === 'COMPLETED' ? 'badge-glow-success' : 'badge-glow-warning'}`}>
                          {doc.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL FORM PEMBUATAN TRANSAKSI */}
      {showModal && (
        <div 
          className="modal-overlay modal-overlay-premium"
          style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}
        >
          <div 
            className="glass-panel"
            style={{
              padding: '24px', 
              borderRadius: '12px', 
              width: '620px', 
              maxHeight: '85vh',
              display: 'flex', 
              flexDirection: 'column', 
              gap: '16px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)'
            }}
          >
            <div className="modal-divider" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>Buat Dokumen Pembelian Baru</h3>
              <button 
                onClick={() => setShowModal(false)} 
                className="btn-modal-close hover-scale"
              >×</button>
            </div>

            <form 
              onSubmit={handleSubmit} 
              className="custom-scrollbar"
              style={{ display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto', maxHeight: '60vh', paddingRight: '6px' }}
            >
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="modal-label">Tipe Dokumen</label>
                  <select 
                    value={docType} 
                    onChange={(e: any) => setDocType(e.target.value)}
                    className="focus-glow"
                    style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-input)', padding: '8px', borderRadius: '6px', color: 'var(--text-input)', fontSize: '12px' }}
                  >
                    <option value="INVOICE">Faktur Pembelian (Invoice)</option>
                    <option value="ORDER">Pesanan Pembelian (PO)</option>
                    <option value="RECEIPT">Penerimaan Barang</option>
                    <option value="RETURN">Retur Pembelian</option>
                  </select>
                </div>
                <div>
                  <label className="modal-label">Pemasok / Supplier</label>
                  <select 
                    value={contactId} 
                    onChange={(e) => setContactId(e.target.value)}
                    className="focus-glow"
                    style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-input)', padding: '8px', borderRadius: '6px', color: 'var(--text-input)', fontSize: '12px' }}
                  >
                    {contacts.map(c => (
                       <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="modal-label">Referensi No. PO / Penerimaan</label>
                  <input 
                    type="text" 
                    placeholder="Contoh: PO-54321" 
                    value={referenceId}
                    onChange={(e) => setReferenceId(e.target.value)}
                    className="focus-glow"
                    style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-input)', padding: '8px', borderRadius: '6px', color: 'var(--text-input)', fontSize: '12px' }}
                  />
                </div>
                <div>
                  <label className="modal-label">Bayar Uang Muka (DP)</label>
                  <input 
                    type="number" 
                    value={dpApplied}
                    onChange={(e) => setDpApplied(Number(e.target.value))}
                    className="focus-glow"
                    style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-input)', padding: '8px', borderRadius: '6px', color: 'var(--text-input)', fontSize: '12px' }}
                  />
                </div>
              </div>

              {/* DAFTAR BARIS ITEM BARANG */}
              <div>
                <label className="modal-label" style={{ fontWeight: '600' }}>Daftar Barang & Jasa</label>
                <div className="item-list-container">
                  {items.map((item, index) => (
                    <div key={index} className="item-row">
                      <select
                        value={item.productId}
                        onChange={(e) => handleItemChange(index, 'productId', e.target.value)}
                        className="focus-glow"
                        style={{ flex: 2, background: 'var(--bg-input)', border: '1px solid var(--border-input)', padding: '8px', borderRadius: '6px', color: 'var(--text-input)', fontSize: '12px' }}
                      >
                        <option value="">-- Pilih Barang --</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                        ))}
                      </select>
                      <input 
                        type="number" 
                        placeholder="Qty" 
                        value={item.qty}
                        onChange={(e) => handleItemChange(index, 'qty', Number(e.target.value))}
                        className="focus-glow"
                        style={{ width: '60px', background: 'var(--bg-input)', border: '1px solid var(--border-input)', padding: '8px', borderRadius: '6px', color: 'var(--text-input)', fontSize: '12px', textAlign: 'center' }}
                      />
                      <input 
                        type="number" 
                        placeholder="Harga" 
                        value={item.price}
                        onChange={(e) => handleItemChange(index, 'price', Number(e.target.value))}
                        className="focus-glow"
                        style={{ width: '110px', background: 'var(--bg-input)', border: '1px solid var(--border-input)', padding: '8px', borderRadius: '6px', color: 'var(--text-input)', fontSize: '12px' }}
                      />
                      <input 
                        type="number" 
                        placeholder="Disc %" 
                        value={item.discount}
                        onChange={(e) => handleItemChange(index, 'discount', Number(e.target.value))}
                        className="focus-glow"
                        style={{ width: '70px', background: 'var(--bg-input)', border: '1px solid var(--border-input)', padding: '8px', borderRadius: '6px', color: 'var(--text-input)', fontSize: '12px', textAlign: 'center' }}
                      />
                      <button 
                        type="button" 
                        onClick={() => handleRemoveItem(index)}
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none', padding: '8px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        className="hover-scale"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
                <button 
                  type="button" 
                  onClick={handleAddItem}
                  className="add-row-btn hover-scale"
                >
                  + Tambah Baris Barang / Jasa
                </button>
              </div>

              <div className="modal-footer-divider" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px', paddingTop: '14px' }}>
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)} 
                  className="btn-cancel hover-scale"
                >Batal</button>
                <button 
                  type="submit" 
                  style={{ background: 'linear-gradient(135deg, #e11d48, #f43f5e)', border: 'none', color: 'white', fontSize: '11px', cursor: 'pointer', padding: '6px 18px', borderRadius: '6px', fontWeight: '600', boxShadow: '0 4px 12px rgba(225, 29, 72, 0.25)' }}
                  className="hover-scale"
                >Simpan Transaksi</button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Modal Tambah Pemasok */}
      {showVendorModal && (
        <div className="modal-overlay modal-overlay-premium" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ padding: '24px', borderRadius: '12px', width: '400px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
            <div className="modal-divider" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>Tambah Pemasok Baru</h3>
              <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }} onClick={() => setShowVendorModal(false)}>
                <X size={18} className="hover-scale" />
              </button>
            </div>
            <form onSubmit={handleAddVendor} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label className="form-label">Nama Pemasok</label>
                <input 
                  type="text" 
                  className="form-input focus-glow" 
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px', width: '100%', boxSizing: 'border-box' }} 
                  placeholder="Nama Lengkap / Instansi" 
                  value={newVendorName} 
                  onChange={e => setNewVendorName(e.target.value)} 
                  required 
                  autoFocus
                />
              </div>

              <div className="modal-footer-divider" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px', paddingTop: '14px' }}>
                <button 
                  type="button" 
                  onClick={() => setShowVendorModal(false)} 
                  className="btn-cancel hover-scale"
                >Batal</button>
                <button 
                  type="submit" 
                  style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', color: 'white', fontSize: '11px', cursor: 'pointer', padding: '6px 18px', borderRadius: '6px', fontWeight: '600', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)' }}
                  className="hover-scale"
                >Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
