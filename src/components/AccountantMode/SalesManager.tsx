import React, { useState, useEffect } from 'react';
import { 
  Plus, CheckCircle, AlertTriangle, 
  Trash2, CreditCard, Users, Award
} from 'lucide-react';
import { db } from '../../utils/db';
import { generateId } from '../../utils/ledgerEngine';

export const SalesManager: React.FC = () => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'FAKTUR' | 'ORDER' | 'DP' | 'PELANGGAN'>('FAKTUR');
  
  // Modal Form State
  const [showModal, setShowModal] = useState(false);
  const [docType, setDocType] = useState<'QUOTATION' | 'ORDER' | 'DELIVERY' | 'INVOICE' | 'RETURN'>('INVOICE');
  const [contactId, setContactId] = useState('c-01');
  const [referenceId, setReferenceId] = useState('');
  const [items, setItems] = useState<any[]>([
    { productId: '', qty: 1, price: 0, discount: 0 }
  ]);
  const [dpApplied, setDpApplied] = useState(0);

  // Komisi & Target Sales (Brainstorming features visual)
  const [salesCommission, setSalesCommission] = useState<number>(0);
  const [salesTarget] = useState<number>(100000000); // Rp 100 Jt
  const [salesAchieved, setSalesAchieved] = useState<number>(0);

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
        <div className="card-custom" style={{ padding: '16px', background: 'rgba(79, 70, 229, 0.1)', border: '1px solid rgba(79, 70, 229, 0.2)', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', color: '#a5b4fc', textTransform: 'uppercase' }}>Target Penjualan</span>
            <Award size={14} style={{ color: '#a5b4fc' }} />
          </div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
            Rp {salesAchieved.toLocaleString('id-ID')} / Rp {salesTarget.toLocaleString('id-ID')}
          </h3>
          <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', marginTop: '12px', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, (salesAchieved / salesTarget) * 100)}%`, height: '100%', background: '#4f46e5' }}></div>
          </div>
        </div>

        <div className="card-custom" style={{ padding: '16px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', color: '#6ee7b7', textTransform: 'uppercase' }}>Komisi Penjual (Estimasi)</span>
            <CreditCard size={14} style={{ color: '#6ee7b7' }} />
          </div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
            Rp {salesCommission.toLocaleString('id-ID')}
          </h3>
          <span style={{ fontSize: '10px', color: '#9ca3af' }}>Dihitung 2.5% dari faktur lunas</span>
        </div>

        <div className="card-custom" style={{ padding: '16px', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.2)', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', color: '#c084fc', textTransform: 'uppercase' }}>Pelanggan Aktif</span>
            <Users size={14} style={{ color: '#c084fc' }} />
          </div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
            {contacts.length} Klien
          </h3>
          <span style={{ fontSize: '10px', color: '#9ca3af' }}>Terdaftar secara offline</span>
        </div>
      </div>

      {/* Sub Tabs Penjualan */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['FAKTUR', 'ORDER', 'DP', 'PELANGGAN'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveSubTab(tab)}
              style={{
                background: activeSubTab === tab ? 'rgba(255,255,255,0.08)' : 'transparent',
                border: 'none',
                color: activeSubTab === tab ? '#ffffff' : '#9ca3af',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: activeSubTab === tab ? '500' : '400',
              }}
            >
              {tab === 'FAKTUR' && 'Faktur Penjualan'}
              {tab === 'ORDER' && 'Pesanan & Pengiriman'}
              {tab === 'DP' && 'Uang Muka'}
              {tab === 'PELANGGAN' && 'Klien / Pelanggan'}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            background: '#4f46e5',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: '500',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <Plus size={12} />
          Buat Transaksi Penjualan
        </button>
      </div>

      {/* TAMPILAN PELANGGAN */}
      {activeSubTab === 'PELANGGAN' ? (
        <div className="table-responsive" style={{ background: '#111218', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <th style={{ padding: '10px 16px' }}>ID Klien</th>
                <th style={{ padding: '10px 16px' }}>Nama Pelanggan</th>
                <th style={{ padding: '10px 16px' }}>Tipe</th>
                <th style={{ padding: '10px 16px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                  <td style={{ padding: '10px 16px', color: '#9ca3af' }}>{c.id}</td>
                  <td style={{ padding: '10px 16px', fontWeight: '500' }}>{c.name}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ padding: '2px 6px', background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', borderRadius: '4px', fontSize: '10px' }}>
                      {c.type}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px', color: '#10b981' }}>Aktif</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* TAMPILAN DOKUMEN */
        <div className="table-responsive" style={{ background: '#111218', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <th style={{ padding: '10px 16px' }}>No. Dokumen</th>
                <th style={{ padding: '10px 16px' }}>Tanggal</th>
                <th style={{ padding: '10px 16px' }}>Pelanggan</th>
                <th style={{ padding: '10px 16px' }}>Tipe</th>
                <th style={{ padding: '10px 16px' }}>Uang Muka</th>
                <th style={{ padding: '10px 16px' }}>Nilai (DPP)</th>
                <th style={{ padding: '10px 16px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {getFilteredDocs().length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>
                    Belum ada riwayat transaksi penjualan.
                  </td>
                </tr>
              ) : (
                getFilteredDocs().map(doc => {
                  const client = contacts.find(c => c.id === doc.contactId)?.name || doc.contactId;
                  return (
                    <tr key={doc.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                      <td style={{ padding: '10px 16px', fontWeight: '500' }}>{doc.id}</td>
                      <td style={{ padding: '10px 16px', color: '#9ca3af' }}>{doc.date}</td>
                      <td style={{ padding: '10px 16px' }}>{client}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ 
                          padding: '2px 6px', 
                          background: doc.type === 'INVOICE' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', 
                          color: doc.type === 'INVOICE' ? '#34d399' : '#fbbf24', 
                          borderRadius: '4px', 
                          fontSize: '10px' 
                        }}>
                          {doc.type}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', color: '#f87171' }}>
                        {doc.dpApplied > 0 ? `Rp ${doc.dpApplied.toLocaleString('id-ID')}` : '-'}
                      </td>
                      <td style={{ padding: '10px 16px', fontWeight: '600' }}>
                        Rp {doc.totalAmount.toLocaleString('id-ID')}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ 
                          color: doc.status === 'COMPLETED' ? '#34d399' : '#fbbf24',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          {doc.status === 'COMPLETED' ? <CheckCircle size={11} /> : <AlertTriangle size={11} />}
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
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center',
          alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: '#0e0f14', border: '1px solid rgba(255,255,255,0.08)',
            padding: '20px', borderRadius: '12px', width: '600px', maxHeight: '85vh',
            display: 'flex', flexDirection: 'column', gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>Buat Dokumen Penjualan Baru</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}>×</button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', maxHeight: '60vh', paddingRight: '4px' }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>Tipe Dokumen</label>
                  <select 
                    value={docType} 
                    onChange={(e: any) => setDocType(e.target.value)}
                    style={{ width: '100%', background: '#1b1c24', border: '1px solid rgba(255,255,255,0.05)', padding: '6px', borderRadius: '6px', color: 'white', fontSize: '12px' }}
                  >
                    <option value="INVOICE">Faktur Penjualan (Invoice)</option>
                    <option value="QUOTATION">Penawaran Penjualan</option>
                    <option value="ORDER">Pesanan Penjualan (SO)</option>
                    <option value="DELIVERY">Pengiriman Pesanan (DO)</option>
                    <option value="RETURN">Retur Penjualan</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>Pelanggan / Klien</label>
                  <select 
                    value={contactId} 
                    onChange={(e) => setContactId(e.target.value)}
                    style={{ width: '100%', background: '#1b1c24', border: '1px solid rgba(255,255,255,0.05)', padding: '6px', borderRadius: '6px', color: 'white', fontSize: '12px' }}
                  >
                    {contacts.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>Referensi No. Pesanan / DO</label>
                  <input 
                    type="text" 
                    placeholder="Contoh: SO-12345" 
                    value={referenceId}
                    onChange={(e) => setReferenceId(e.target.value)}
                    style={{ width: '100%', background: '#1b1c24', border: '1px solid rgba(255,255,255,0.05)', padding: '6px', borderRadius: '6px', color: 'white', fontSize: '12px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>Potong Uang Muka (DP)</label>
                  <input 
                    type="number" 
                    value={dpApplied}
                    onChange={(e) => setDpApplied(Number(e.target.value))}
                    style={{ width: '100%', background: '#1b1c24', border: '1px solid rgba(255,255,255,0.05)', padding: '6px', borderRadius: '6px', color: 'white', fontSize: '12px' }}
                  />
                </div>
              </div>

              {/* DAFTAR BARIS ITEM BARANG */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>Daftar Barang & Jasa</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {items.map((item, index) => (
                    <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <select
                        value={item.productId}
                        onChange={(e) => handleItemChange(index, 'productId', e.target.value)}
                        style={{ flex: 2, background: '#1b1c24', border: '1px solid rgba(255,255,255,0.05)', padding: '6px', borderRadius: '6px', color: 'white', fontSize: '12px' }}
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
                        style={{ width: '60px', background: '#1b1c24', border: '1px solid rgba(255,255,255,0.05)', padding: '6px', borderRadius: '6px', color: 'white', fontSize: '12px' }}
                      />
                      <input 
                        type="number" 
                        placeholder="Harga" 
                        value={item.price}
                        onChange={(e) => handleItemChange(index, 'price', Number(e.target.value))}
                        style={{ width: '100px', background: '#1b1c24', border: '1px solid rgba(255,255,255,0.05)', padding: '6px', borderRadius: '6px', color: 'white', fontSize: '12px' }}
                      />
                      <input 
                        type="number" 
                        placeholder="Diskon %" 
                        value={item.discount}
                        onChange={(e) => handleItemChange(index, 'discount', Number(e.target.value))}
                        style={{ width: '70px', background: '#1b1c24', border: '1px solid rgba(255,255,255,0.05)', padding: '6px', borderRadius: '6px', color: 'white', fontSize: '12px' }}
                      />
                      <button 
                        type="button" 
                        onClick={() => handleRemoveItem(index)}
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer' }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <button 
                  type="button" 
                  onClick={handleAddItem}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.1)', padding: '6px', width: '100%', borderRadius: '6px', color: '#9ca3af', fontSize: '11px', cursor: 'pointer', marginTop: '8px' }}
                >
                  + Tambah Baris Barang
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ background: 'transparent', border: 'none', color: '#9ca3af', fontSize: '11px', cursor: 'pointer', padding: '6px 12px' }}>Batal</button>
                <button type="submit" style={{ background: '#4f46e5', border: 'none', color: 'white', fontSize: '11px', cursor: 'pointer', padding: '6px 16px', borderRadius: '6px', fontWeight: '500' }}>Simpan Transaksi</button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};
