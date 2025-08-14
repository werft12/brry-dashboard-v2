'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { TwoCheckbox } from '@/components/ui/two-checkbox';
import { 
  setMarketingServicePrepared, 
  setMarketingServiceCompleted,
  setCustomMarketingServicePrepared,
  setCustomMarketingServiceCompleted
} from '@/lib/marketing-checklist';

interface MarketingChecklist {
  id: string;
  customerId: string;
  ym: string;
  services: {
    handzettel?: { done?: boolean; prepared?: boolean };
    poster?: { done?: boolean; prepared?: boolean };
    social?: { done?: boolean; prepared?: boolean };
    newsletter?: { done?: boolean; prepared?: boolean };
  };
  custom?: Record<string, { done?: boolean; prepared?: boolean; label: string }>;
}

const STANDARD_SERVICES = [
  { key: 'handzettel', label: 'Handzettel' },
  { key: 'poster', label: 'Poster A1' },
  { key: 'social', label: 'Social Media' },
  { key: 'newsletter', label: 'Newsletter' },
] as const;

export default function MarketingPage() {
  const [checklists, setChecklists] = useState<MarketingChecklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  
  const ym = '2025-09'; // Current month

  // Load data from Firestore
  useEffect(() => {
    const q = query(collection(db, 'marketingChecklists'), where('ym', '==', ym));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as MarketingChecklist[];
      setChecklists(data);
      setLoading(false);
    });
    return unsubscribe;
  }, [ym]);

  // Toggle handlers - direct Firestore writes
  async function toggleServicePrepared(customerId: string, service: string, prepared: boolean) {
    try {
      await setMarketingServicePrepared(customerId, ym, service as any, prepared);
    } catch (e) {
      console.error('toggleServicePrepared failed', e);
    }
  }

  async function toggleServiceCompleted(customerId: string, service: string, completed: boolean) {
    try {
      await setMarketingServiceCompleted(customerId, ym, service as any, completed);
    } catch (e) {
      console.error('toggleServiceCompleted failed', e);
    }
  }

  async function toggleCustomServicePrepared(customerId: string, service: string, label: string, prepared: boolean) {
    try {
      await setCustomMarketingServicePrepared(customerId, ym, service, label, prepared);
    } catch (e) {
      console.error('toggleCustomServicePrepared failed', e);
    }
  }

  async function toggleCustomServiceCompleted(customerId: string, service: string, label: string, completed: boolean) {
    try {
      await setCustomMarketingServiceCompleted(customerId, ym, service, label, completed);
    } catch (e) {
      console.error('toggleCustomServiceCompleted failed', e);
    }
  }

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Marketing-Services</h1>
      
      {checklists.map((checklist) => (
        <div key={checklist.id} className="mb-4 border rounded-lg">
          <div 
            className="p-4 cursor-pointer bg-gray-50 hover:bg-gray-100"
            onClick={() => setExpanded(prev => ({ ...prev, [checklist.customerId]: !prev[checklist.customerId] }))}
          >
            <h2 className="font-semibold">Customer {checklist.customerId}</h2>
          </div>
          
          {expanded[checklist.customerId] && (
            <div className="p-4 border-t">
              {/* Standard Services */}
              {STANDARD_SERVICES.map(({ key, label }) => {
                const service = checklist.services[key as keyof typeof checklist.services];
                const prepared = !!service?.prepared;
                const completed = !!service?.done;
                
                return (
                  <div key={key} className="flex items-center justify-between py-2">
                    <span>{label}</span>
                    <TwoCheckbox
                      prepared={prepared}
                      completed={completed}
                      onPreparedChange={(prepared) => toggleServicePrepared(checklist.customerId, key, prepared)}
                      onCompletedChange={(completed) => toggleServiceCompleted(checklist.customerId, key, completed)}
                    />
                  </div>
                );
              })}
              
              {/* Custom Services */}
              {Object.entries(checklist.custom || {}).map(([key, service]) => {
                const prepared = !!service.prepared;
                const completed = !!service.done;
                
                return (
                  <div key={key} className="flex items-center justify-between py-2">
                    <span>{service.label}</span>
                    <TwoCheckbox
                      prepared={prepared}
                      completed={completed}
                      onPreparedChange={(prepared) => toggleCustomServicePrepared(checklist.customerId, key, service.label, prepared)}
                      onCompletedChange={(completed) => toggleCustomServiceCompleted(checklist.customerId, key, service.label, completed)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
