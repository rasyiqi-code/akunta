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
  const [contactId, setContactId] = useState('c-01');
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
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', color: '#f3f4f6' }}>
      
      {/* Sales Analytics Dashboard Widget */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
        <div 
          className="glass-card hover-scale hover-glow-indigo"
          onMouseEnter={() => setHoveredCard('target')}
          onMouseLeave={() => setHoveredCard(null)}
          style={{ 
            padding: '18px', 
            background: hoveredCard === 'target' 
              ? 'linear-gradient(135deg, rgba(79, 70, 229, 0.18), rgba(124, 58, 237, 0.08))' 
              : 'rgba(79, 70, 229, 0.06)', 
            border: '1px solid rgba(79, 70, 229, 0.2)', 
            borderRadius: '10px' 
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '10px', color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>Target Penjualan</span>
            <Award size={15} style={{ color: '#a5b4fc' }} />
          </div>
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '700', letterSpacing: '-0.3px' }}>
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
              ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.18), rgba(4, 120, 87, 0.08))'
              : 'rgba(16, 185, 129, 0.06)', 
            border: '1px solid rgba(16, 185, 129, 0.2)', 
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
          <span style={{ fontSize: '10px', color: '#9ca3af', marginTop: '14px', display: 'block' }}>Dihitung 2.5% dari faktur lunas</span>
        </div>

        <div 
          className="glass-card hover-scale hover-glow-violet"
          onMouseEnter={() => setHoveredCard('klien')}
          onMouseLeave={() => setHoveredCard(null)}
          style={{ 
            padding: '18px', 
            background: hoveredCard === 'klien'
              ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.18), rgba(109, 40, 217, 0.08))'
              : 'rgba(139, 92, 246, 0.06)', 
            border: '1px solid rgba(139, 92, 246, 0.2)', 
            borderRadius: '10px' 
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '10px', color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>Pelanggan Aktif</span>
            <Users size={15} style={{ color: '#c084fc' }} />
          </div>
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '700', letterSpacing: '-0.3px' }}>
            {contacts.length} Klien
          </h3>
          <span style={{ fontSize: '10px', color: '#9ca3af', marginTop: '14px', display: 'block' }}>Terdaftar secara offline</span>
        </div>
      </div>

      {/* Sub Tabs Penjualan */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px', marginTop: '4px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['FAKTUR', 'ORDER', 'DP', 'PELANGGAN'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveSubTab(tab)}
              style={{
                background: activeSubTab === tab ? 'rgba(255,255,255,0.08)' : 'transparent',
                border: 'none',
                color: activeSubTab === tab ? '#ffffff' : '#9ca3af',
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
        <div className="table-responsive" style={{ background: 'rgba(15,16,22,0.6)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden', backdropFilter: 'blur(10px)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <th style={{ padding: '12px 16px', color: '#9ca3af', fontWeight: '600' }}>ID Klien</th>
                <th style={{ padding: '12px 16px', color: '#9ca3af', fontWeight: '600' }}>Nama Pelanggan</th>
                <th style={{ padding: '12px 16px', color: '#9ca3af', fontWeight: '600' }}>Tipe</th>
                <th style={{ padding: '12px 16px', color: '#9ca3af', fontWeight: '600' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'background 0.15s ease' }} className="cmd-menu-item">
                  <td style={{ padding: '12px 16px', color: '#9ca3af' }}>{c.id}</td>
                  <td style={{ padding: '12px 16px', fontWeight: '600', color: '#ffffff' }}>{c.name}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span className="badge-glow badge-glow-info">
                      {c.type}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span className="badge-glow badge-glow-success">Aktif</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* TAMPILAN DOKUMEN */
        <div className="table-responsive" style={{ background: 'rgba(15,16,22,0.6)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden', backdropFilter: 'blur(10px)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <th style={{ padding: '12px 16px', color: '#9ca3af', fontWeight: '600' }}>No. Dokumen</th>
                <th style={{ padding: '12px 16px', color: '#9ca3af', fontWeight: '600' }}>Tanggal</th>
                <th style={{ padding: '12px 16px', color: '#9ca3af', fontWeight: '600' }}>Pelanggan</th>
                <th style={{ padding: '12px 16px', color: '#9ca3af', fontWeight: '600' }}>Tipe</th>
                <th style={{ padding: '12px 16px', color: '#9ca3af', fontWeight: '600' }}>Uang Muka</th>
                <th style={{ padding: '12px 16px', color: '#9ca3af', fontWeight: '600' }}>Nilai (DPP)</th>
                <th style={{ padding: '12px 16px', color: '#9ca3af', fontWeight: '600' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {getFilteredDocs().length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontStyle: 'italic' }}>
                    Belum ada riwayat transaksi penjualan.
                  </td>
                </tr>
              ) : (
                getFilteredDocs().map(doc => {
                  const client = contacts.find(c => c.id === doc.contactId)?.name || doc.contactId;
                  return (
                    <tr key={doc.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'background 0.15s ease' }} className="cmd-menu-item">
                      <td style={{ padding: '12px 16px', fontWeight: '600', color: '#ffffff' }}>{doc.id}</td>
                      <td style={{ padding: '12px 16px', color: '#a1a1aa' }}>{doc.date}</td>
                      <td style={{ padding: '12px 16px', color: '#e4e4e7' }}>{client}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span className={`badge-glow ${doc.type === 'INVOICE' ? 'badge-glow-success' : 'badge-glow-warning'}`}>
                          {doc.type}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#f87171', fontFamily: 'monospace' }}>
                        {doc.dpApplied > 0 ? `Rp ${doc.dpApplied.toLocaleString('id-ID')}` : '-'}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: '700', color: '#ffffff', fontFamily: 'monospace' }}>
                        Rp {doc.totalAmount.toLocaleString('id-ID')}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'white', letterSpacing: '-0.2px' }}>Buat Dokumen Penjualan Baru</h3>
              <button 
                onClick={() => setShowModal(false)} 
                style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center' }}
                className="hover-scale"
              >×</button>
            </div>

            <form 
              onSubmit={handleSubmit} 
              className="custom-scrollbar"
              style={{ display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto', maxHeight: '60vh', paddingRight: '6px' }}
            >
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '4px', fontWeight: '500' }}>Tipe Dokumen</label>
                  <select 
                    value={docType} 
                    onChange={(e: any) => setDocType(e.target.value)}
                    className="focus-glow"
                    style={{ width: '100%', background: '#12131a', border: '1px solid rgba(255,255,255,0.08)', padding: '8px', borderRadius: '6px', color: 'white', fontSize: '12px' }}
                  >
                    <option value="INVOICE">Faktur Penjualan (Invoice)</option>
                    <option value="QUOTATION">Penawaran Penjualan</option>
                    <option value="ORDER">Pesanan Penjualan (SO)</option>
                    <option value="DELIVERY">Pengiriman Pesanan (DO)</option>
                    <option value="RETURN">Retur Penjualan</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '4px', fontWeight: '500' }}>Pelanggan / Klien</label>
                  <select 
                    value={contactId} 
                    onChange={(e) => setContactId(e.target.value)}
                    className="focus-glow"
                    style={{ width: '100%', background: '#12131a', border: '1px solid rgba(255,255,255,0.08)', padding: '8px', borderRadius: '6px', color: 'white', fontSize: '12px' }}
                  >
                    {contacts.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '4px', fontWeight: '500' }}>Referensi No. Pesanan / DO</label>
                  <input 
                    type="text" 
                    placeholder="Contoh: SO-12345" 
                    value={referenceId}
                    onChange={(e) => setReferenceId(e.target.value)}
                    className="focus-glow"
                    style={{ width: '100%', background: '#12131a', border: '1px solid rgba(255,255,255,0.08)', padding: '8px', borderRadius: '6px', color: 'white', fontSize: '12px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '4px', fontWeight: '500' }}>Potong Uang Muka (DP)</label>
                  <input 
                    type="number" 
                    value={dpApplied}
                    onChange={(e) => setDpApplied(Number(e.target.value))}
                    className="focus-glow"
                    style={{ width: '100%', background: '#12131a', border: '1px solid rgba(255,255,255,0.08)', padding: '8px', borderRadius: '6px', color: 'white', fontSize: '12px' }}
                  />
                </div>
              </div>

              {/* DAFTAR BARIS ITEM BARANG */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '6px', fontWeight: '600' }}>Daftar Barang & Jasa</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {items.map((item, index) => (
                    <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <select
                        value={item.productId}
                        onChange={(e) => handleItemChange(index, 'productId', e.target.value)}
                        className="focus-glow"
                        style={{ flex: 2, background: '#12131a', border: '1px solid rgba(255,255,255,0.08)', padding: '8px', borderRadius: '6px', color: 'white', fontSize: '12px' }}
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
                        style={{ width: '60px', background: '#12131a', border: '1px solid rgba(255,255,255,0.08)', padding: '8px', borderRadius: '6px', color: 'white', fontSize: '12px', textAlign: 'center' }}
                      />
                      <input 
                        type="number" 
                        placeholder="Harga" 
                        value={item.price}
                        onChange={(e) => handleItemChange(index, 'price', Number(e.target.value))}
                        className="focus-glow"
                        style={{ width: '110px', background: '#12131a', border: '1px solid rgba(255,255,255,0.08)', padding: '8px', borderRadius: '6px', color: 'white', fontSize: '12px' }}
                      />
                      <input 
                        type="number" 
                        placeholder="Disc %" 
                        value={item.discount}
                        onChange={(e) => handleItemChange(index, 'discount', Number(e.target.value))}
                        className="focus-glow"
                        style={{ width: '70px', background: '#12131a', border: '1px solid rgba(255,255,255,0.08)', padding: '8px', borderRadius: '6px', color: 'white', fontSize: '12px', textAlign: 'center' }}
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
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.12)', padding: '8px', width: '100%', borderRadius: '6px', color: '#a1a1aa', fontSize: '11px', cursor: 'pointer', marginTop: '8px', transition: 'all 0.2s ease' }}
                  className="hover-scale"
                >
                  + Tambah Baris Barang / Jasa
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '14px' }}>
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)} 
                  style={{ background: 'transparent', border: 'none', color: '#a1a1aa', fontSize: '11px', cursor: 'pointer', padding: '6px 12px', fontWeight: '500' }}
                  className="hover-scale"
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'white' }}>Tambah Pelanggan Baru</h3>
              <button style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={() => setShowCustomerModal(false)}>
                <X size={18} className="hover-scale" />
              </button>
            </div>
            <form onSubmit={handleAddCustomer} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label className="form-label">Nama Pelanggan</label>
                <input 
                  type="text" 
                  className="form-input focus-glow" 
                  style={{ background: '#12131a', border: '1px solid rgba(255,255,255,0.08)', color: 'white', padding: '6px 8px', borderRadius: '6px', width: '100%', boxSizing: 'border-box' }} 
                  placeholder="Nama Lengkap / Instansi" 
                  value={newCustomerName} 
                  onChange={e => setNewCustomerName(e.target.value)} 
                  required 
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '14px' }}>
                <button 
                  type="button" 
                  onClick={() => setShowCustomerModal(false)} 
                  style={{ background: 'transparent', border: 'none', color: '#a1a1aa', fontSize: '11px', cursor: 'pointer', padding: '6px 12px', fontWeight: '500' }}
                  className="hover-scale"
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
