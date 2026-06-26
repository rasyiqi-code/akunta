import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, CreditCard, Users, Award, X
} from 'lucide-react';
import { db } from '../../utils/db';
import { generateId } from '../../utils/ledgerEngine';

export const SalesManager: React.FC = () => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'FAKTUR' | 'ORDER' | 'DP' | 'PELANGGAN'>('FAKTUR');
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  
  // Modal Form State
  const [showModal, setShowModal] = useState(false);
  const [docType, setDocType] = useState<'QUOTATION' | 'ORDER' | 'DELIVERY' | 'INVOICE' | 'RETURN'>('INVOICE');
  const [contactId, setContactId] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [items, setItems] = useState<any[]>([
    { productId: '', qty: 1, price: 0, discount: 0 }
  ]);
  const [dpApplied, setDpApplied] = useState(0);

  // Customer Modal State
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');

  // Komisi & Target Sales (Brainstorming features visual)
  const [salesCommission, setSalesCommission] = useState<number>(0);
  const [salesTarget] = useState<number>(100000000); // Rp 100 Jt
  const [salesAchieved, setSalesAchieved] = useState<number>(0);

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName.trim()) return;

    const newId = generateId('c');
    const newContact = {
      id: newId,
      name: newCustomerName,
      type: 'CUSTOMER' as const
    };

    try {
      await db.contacts.add(newContact);
      setNewCustomerName('');
      setShowCustomerModal(false);
      
      const event = new CustomEvent('db-update');
      window.dispatchEvent(event);
      
      fetchData();
    } catch (err) {
      console.error(err);
      alert('Gagal menambahkan pelanggan baru.');
    }
  };

  const fetchData = async () => {
    try {
      const [docList, prodList, contactList] = await Promise.all([
        db.salesDocuments.toArray(),
        db.products.toArray(),
        db.contacts.toArray()
      ]);
      setDocuments(docList);
      setProducts(prodList);
      setContacts(contactList.filter(c => c.type === 'CUSTOMER'));

      // Hitung pencapaian sales target & komisi (simulasi)
      const invoiceTotal = docList
        .filter(d => d.type === 'INVOICE' && d.status === 'COMPLETED')
        .reduce((sum, d) => sum + d.totalAmount, 0);
      setSalesAchieved(invoiceTotal);
      setSalesCommission(invoiceTotal * 0.025); // komisi 2.5%
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
    
    // Auto fill price jika productId berubah
    if (field === 'productId') {
      const p = products.find(prod => prod.id === value);
      if (p) {
        newItems[index].price = p.sellingPrice;
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

    const docId = generateId(docType === 'INVOICE' ? 'INV' : 'DOC');
    const totalBeforePpn = items.reduce((sum, item) => {
      const lineTotal = item.qty * item.price * (1 - item.discount / 100);
      return sum + lineTotal;
    }, 0);
    const ppnAmount = Math.round(totalBeforePpn * 0.11);
    const grandTotal = totalBeforePpn + ppnAmount;

    const finalDoc = {
      id: docId,
      date: new Date().toISOString().split('T')[0],
      contactId,
      type: docType,
      status: docType === 'INVOICE' ? 'COMPLETED' : 'PENDING',
      referenceId: referenceId || undefined,
      totalAmount: totalBeforePpn,
      ppnAmount,
      grandTotal,
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
      await db.salesDocuments.add(finalDoc);
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
      alert('Gagal menyimpan dokumen penjualan.');
    }
  };

  // Filter dokumen berdasarkan sub-tab
  const getFilteredDocs = () => {
    switch (activeSubTab) {
      case 'FAKTUR':
        return documents.filter(d => d.type === 'INVOICE');
      case 'ORDER':
        return documents.filter(d => d.type === 'ORDER' || d.type === 'QUOTATION' || d.type === 'DELIVERY');
      case 'DP':
        return documents.filter(d => d.dpApplied > 0);
      default:
        return documents;
    }
  };

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', color: 'var(--text-primary)' }}>
      
      {/* Sales Analytics Dashboard Widget */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
        <div 
          className="glass-card hover-scale hover-glow-indigo"
          onMouseEnter={() => setHoveredCard('target')}
          onMouseLeave={() => setHoveredCard(null)}
          style={{ 
            padding: '18px', 
            background: hoveredCard === 'target' 
              ? 'rgba(20, 20, 24, 0.9)' 
              : 'rgba(10, 10, 12, 0.8)', 
            border: '1px solid rgba(79, 70, 229, 0.25)', 
            borderRadius: '10px' 
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '10px', color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>Target Penjualan</span>
            <Award size={15} style={{ color: '#a5b4fc' }} />
          </div>
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '700', letterSpacing: '-0.3px', color: '#ffffff' }}>
            Rp {salesAchieved.toLocaleString('id-ID')} <span style={{ fontSize: '11px', color: '#8c9beb', fontWeight: 'normal' }}>/ Rp {salesTarget.toLocaleString('id-ID')}</span>
          </h3>
          <div style={{ width: '100%', height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', marginTop: '14px', overflow: 'hidden' }}>
            <div style={{ 
              width: `${Math.min(100, (salesAchieved / salesTarget) * 100)}%`, 
              height: '100%', 
              background: 'linear-gradient(90deg, #4f46e5, #8b5cf6)',
              boxShadow: '0 0 8px #4f46e5',
              transition: 'width 0.8s ease-in-out'
            }}></div>
          </div>
        </div>

        <div 
          className="glass-card hover-scale hover-glow-emerald"
          onMouseEnter={() => setHoveredCard('komisi')}
          onMouseLeave={() => setHoveredCard(null)}
          style={{ 
            padding: '18px', 
            background: hoveredCard === 'komisi'
              ? 'rgba(20, 20, 24, 0.9)'
              : 'rgba(10, 10, 12, 0.8)', 
            border: '1px solid rgba(16, 185, 129, 0.25)', 
            borderRadius: '10px' 
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '10px', color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>Komisi Penjual (Estimasi)</span>
            <CreditCard size={15} style={{ color: '#6ee7b7' }} />
          </div>
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '700', letterSpacing: '-0.3px', color: '#34d399' }}>
            Rp {salesCommission.toLocaleString('id-ID')}
          </h3>
          <span style={{ fontSize: '10px', color: '#6b7280', marginTop: '14px', display: 'block' }}>Dihitung 2.5% dari faktur lunas</span>
        </div>

        <div 
          className="glass-card hover-scale hover-glow-violet"
          onMouseEnter={() => setHoveredCard('klien')}
          onMouseLeave={() => setHoveredCard(null)}
          style={{ 
            padding: '18px', 
            background: hoveredCard === 'klien'
              ? 'rgba(20, 20, 24, 0.9)'
              : 'rgba(10, 10, 12, 0.8)',
            border: '1px solid rgba(139, 92, 246, 0.25)', 
            borderRadius: '10px' 
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '10px', color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>Pelanggan Aktif</span>
            <Users size={15} style={{ color: '#c084fc' }} />
          </div>
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '700', letterSpacing: '-0.3px', color: '#ffffff' }}>
            {contacts.length} Klien
          </h3>
          <span style={{ fontSize: '10px', color: '#6b7280', marginTop: '14px', display: 'block' }}>Terdaftar secara offline</span>
        </div>
      </div>

      {/* Sub Tabs Penjualan */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-table)', paddingBottom: '8px', marginTop: '4px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['FAKTUR', 'ORDER', 'DP', 'PELANGGAN'] as const).map(tab => (
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
              {tab === 'FAKTUR' && 'Faktur Penjualan'}
              {tab === 'ORDER' && 'Pesanan & Pengiriman'}
              {tab === 'DP' && 'Uang Muka'}
              {tab === 'PELANGGAN' && 'Klien / Pelanggan'}
            </button>
          ))}
        </div>
        {activeSubTab === 'PELANGGAN' ? (
          <button
            onClick={() => setShowCustomerModal(true)}
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
            Tambah Pelanggan
          </button>
        ) : (
          <button
            onClick={() => setShowModal(true)}
            style={{
              background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
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
              boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
              transition: 'all 0.2s ease'
            }}
            className="hover-scale"
          >
            <Plus size={13} />
            Buat Transaksi Penjualan
          </button>
        )}
      </div>

      {/* TAMPILAN PELANGGAN */}
      {activeSubTab === 'PELANGGAN' ? (
        <div className="table-responsive data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID Klien</th>
                <th>Nama Pelanggan</th>
                <th>Tipe</th>
                <th>Status</th>
                <th style={{ width: '60px' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => (
                <tr key={c.id}>
                  <td className="td-muted">{c.id}</td>
                  <td className="td-primary">{c.name}</td>
                  <td>
                    <span className="badge-glow badge-glow-info">
                      {c.type}
                    </span>
                  </td>
                  <td>
                    <span className="badge-glow badge-glow-success">Aktif</span>
                  </td>
                  <td>
                    <button className="btn btn-secondary" style={{ padding: '2px 5px', fontSize: '10px', marginRight: '2px' }} title="Edit" onClick={async () => { const newName = prompt('Nama baru:', c.name); if (newName && newName !== c.name) { await db.contacts.put({ ...c, name: newName }); fetchData(); } }}>✎</button>
                    <button className="btn btn-secondary" style={{ padding: '2px 5px', fontSize: '10px' }} title="Hapus" onClick={async () => { if (window.confirm(`Hapus pelanggan ${c.name}?`)) { await db.contacts.delete(c.id); fetchData(); } }}>🗑</button>
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
                <th>Pelanggan</th>
                <th>Tipe</th>
                <th>Uang Muka</th>
                <th>Nilai (DPP)</th>
                <th>Status</th>
                <th style={{ width: '40px' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {getFilteredDocs().length === 0 ? (
                <tr>
                  <td colSpan={8} className="td-empty">
                    Belum ada riwayat transaksi penjualan.
                  </td>
                </tr>
              ) : (
                getFilteredDocs().map(doc => {
                  const client = contacts.find(c => c.id === doc.contactId)?.name || doc.contactId;
                  return (
                    <tr key={doc.id}>
                      <td className="td-primary">{doc.id}</td>
                      <td className="td-muted">{doc.date}</td>
                      <td>{client}</td>
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
                      <td>
                        <button className="btn btn-secondary" style={{ padding: '2px 5px', fontSize: '10px' }} title="Hapus" onClick={async () => { if (window.confirm(`Hapus dokumen ${doc.id}?`)) { await db.salesDocuments.delete(doc.id); fetchData(); } }}>🗑</button>
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
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.2px' }}>Buat Dokumen Penjualan Baru</h3>
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
                    <option value="INVOICE">Faktur Penjualan (Invoice)</option>
                    <option value="QUOTATION">Penawaran Penjualan</option>
                    <option value="ORDER">Pesanan Penjualan (SO)</option>
                    <option value="DELIVERY">Pengiriman Pesanan (DO)</option>
                    <option value="RETURN">Retur Penjualan</option>
                  </select>
                </div>
                <div>
                  <label className="modal-label">Pelanggan / Klien</label>
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
                  <label className="modal-label">Referensi No. Pesanan / DO</label>
                  <input 
                    type="text" 
                    placeholder="Contoh: SO-12345" 
                    value={referenceId}
                    onChange={(e) => setReferenceId(e.target.value)}
                    className="focus-glow"
                    style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-input)', padding: '8px', borderRadius: '6px', color: 'var(--text-input)', fontSize: '12px' }}
                  />
                </div>
                <div>
                  <label className="modal-label">Potong Uang Muka (DP)</label>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {items.map((item, index) => (
                    <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
                  style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)', border: 'none', color: 'white', fontSize: '11px', cursor: 'pointer', padding: '6px 18px', borderRadius: '6px', fontWeight: '600', boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)' }}
                  className="hover-scale"
                >Simpan Transaksi</button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Modal Tambah Pelanggan */}
      {showCustomerModal && (
        <div className="modal-overlay modal-overlay-premium" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ padding: '24px', borderRadius: '12px', width: '400px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
            <div className="modal-divider" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>Tambah Pelanggan Baru</h3>
              <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }} onClick={() => setShowCustomerModal(false)}>
                <X size={18} className="hover-scale" />
              </button>
            </div>
            <form onSubmit={handleAddCustomer} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label className="form-label">Nama Pelanggan</label>
                <input 
                  type="text" 
                  className="form-input focus-glow" 
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px', width: '100%', boxSizing: 'border-box' }} 
                  placeholder="Nama Lengkap / Instansi" 
                  value={newCustomerName} 
                  onChange={e => setNewCustomerName(e.target.value)} 
                  required 
                  autoFocus
                />
              </div>

              <div className="modal-footer-divider" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px', paddingTop: '14px' }}>
                <button 
                  type="button" 
                  onClick={() => setShowCustomerModal(false)} 
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
