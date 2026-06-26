import React from 'react';
import { X, Sparkles } from 'lucide-react';

interface Props {
  show: boolean;
  diagnosisText: string;
  isDiagnosing: boolean;
  onClose: () => void;
}

export const DiagnosisModal: React.FC<Props> = ({
  show, diagnosisText, isDiagnosing, onClose,
}) => {
  if (!show) return null;

  return (
    <div className="modal-overlay modal-overlay-premium" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
      <div className="glass-panel glow-pulse-border" style={{ padding: '24px', borderRadius: '12px', width: '500px', maxWidth: '90%', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={16} style={{ color: 'var(--accent-primary)' }} />
            <span>Diagnosis AI Akunta</span>
          </h3>
          <button style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={onClose}>
            <X size={18} className="hover-scale" />
          </button>
        </div>
        <div className="custom-scrollbar" style={{ fontSize: '12.5px', lineHeight: '1.6', whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', overflowY: 'auto', maxHeight: '50vh', paddingRight: '4px' }}>
          {diagnosisText}
          {isDiagnosing && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
              <div style={{ width: '24px', height: '24px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
