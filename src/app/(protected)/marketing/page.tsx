'use client';

import { useState, useEffect, useMemo } from 'react';
import { listenCustomers } from '@/lib/db';
import type { Customer } from '@/lib/types';
import Card from '@/components/ui/card';
import { TwoCheckbox } from '@/components/ui/two-checkbox';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { 
  setMarketingServicePrepared, 
  setMarketingServiceCompleted,
  setCustomMarketingServicePrepared,
  setCustomMarketingServiceCompleted,
  yearMonthKey,
  listenMarketingChecklistForMonth
} from '@/lib/marketing-checklist';
import type { MarketingChecklist as ChecklistDoc, MarketingServiceKey } from '@/lib/marketing-checklist';

// Define services locally since they're not exported from marketing-checklist
const SERVICES: { key: MarketingServiceKey; label: string }[] = [
  { key: 'handzettel', label: 'Handzettel' },
  { key: 'poster', label: 'Poster A1' },
  { key: 'social', label: 'Social Media' },
  { key: 'newsletter', label: 'Newsletter' }
];


interface CustomServiceDef {
  key: string;
  label: string;
}

function slug(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export default function MarketingPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [ym, setYm] = useState<string>(() => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return yearMonthKey(next);
  });
  const [autoFollowNext, setAutoFollowNext] = useState(true);
  const [checklists, setChecklists] = useState<ChecklistDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Storage helpers
  const expandedStorageKey = (value: string) => `marketingExpanded:${value}`;

  // Load customers
  useEffect(() => {
    const unsubscribe = listenCustomers(setCustomers);
    return unsubscribe;
  }, []);

  // Active customers (those with marketing services)
  const activeCustomers = useMemo(() => {
    // Filter customers that have marketing services
    // Either they have hasMarketing=true OR they have extraServices (custom marketing services)
    return customers.filter(c => {
      const hasMarketing = (c as any).hasMarketing;
      const extraServices = (c as any).extraServices || [];
      return hasMarketing === true || extraServices.length > 0;
    });
  }, [customers]);

  // Custom services by customer
  const customDefsByCustomer = useMemo(() => {
    const map: Record<string, { key: string; label: string }[]> = {};
    for (const c of activeCustomers) {
      const extraServices = (c as any).extraServices || [];
      const defs = extraServices
        .filter((s: any) => (s.name || '').trim().length > 0)
        .map((s: any) => ({ key: slug(s.name), label: s.name.trim() }));
      map[c.id] = defs;
    }
    return map;
  }, [activeCustomers]);

  const ymToLabel = (value: string) => {
    const [y, m] = value.split("-").map((v) => parseInt(v, 10));
    const d = new Date(y, (m || 1) - 1, 1);
    return d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  };

  // Auto-follow next month
  useEffect(() => {
    const check = () => {
      if (!autoFollowNext) return;
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const key = yearMonthKey(next);
      if (key !== ym) setYm(key);
    };
    check();
    const id = setInterval(check, 60_000);
    const onFocus = () => check();
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [autoFollowNext, ym]);

  // Persist expanded state for the current month
  useEffect(() => {
    const key = expandedStorageKey(ym);
    localStorage.setItem(key, JSON.stringify(expanded));
  }, [expanded, ym]);

  // Load expanded state when month changes
  useEffect(() => {
    const key = expandedStorageKey(ym);
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        setExpanded(JSON.parse(stored));
      } catch (e) {
        setExpanded({});
      }
    } else {
      setExpanded({});
    }
  }, [ym]);

  // Load data from Firestore using normalized listener
  useEffect(() => {
    const unsubscribe = listenMarketingChecklistForMonth(ym, (items) => {
      // Debug: Log Firestore document structure
      console.log('🔍 Firestore snapshot received:', items.length, 'documents');
      items.forEach(doc => {
        console.log(`📄 Document ${doc.id}:`, {
          customerId: doc.customerId,
          ym: doc.ym,
          services: doc.services,
          custom: doc.custom
        });
        
        // Check specific services for Weber Apotheken
        if (doc.customerId === 'BmWPmcyvNOGOnMREdOJu') {
          console.log('🔍 Weber Apotheken services detail:', {
            handzettel: doc.services?.handzettel,
            social: doc.services?.social,
            poster: doc.services?.poster,
            newsletter: doc.services?.newsletter,
            customServices: doc.custom
          });
        }
      });
      setChecklists(items);
      setLoading(false);
    });
    return unsubscribe;
  }, [ym]);

  // Navigation
  function changeMonth(delta: number) {
    const [y, m] = ym.split("-").map((v) => parseInt(v, 10));
    const date = new Date(y, m - 1 + delta, 1);
    setYm(yearMonthKey(date));
    setAutoFollowNext(false);
  }

  // Helper to get customer name
  function getCustomerName(customerId: string): string {
    const customer = customers.find(c => c.id === customerId);
    return customer?.name || customerId;
  }

  // Calculate KPIs
  const kpis = useMemo(() => {
    const totalCustomers = activeCustomers.length;
    let totalServices = 0;
    let doneServices = 0;
    let preparedServices = 0;
    
    for (const c of activeCustomers) {
      const customDefs = customDefsByCustomer[c.id] || [];
      totalServices += SERVICES.length + customDefs.length;
      
      const checklist = checklists.find(cl => cl.customerId === c.id);
      if (checklist) {
        // Count standard services
        for (const s of SERVICES) {
          if (checklist.services[s.key]?.done) {
            doneServices += 1;
            preparedServices += 1; // Done implies prepared
          } else if (checklist.services[s.key]?.prepared) {
            preparedServices += 1;
          }
        }
        // Count custom services
        for (const def of customDefs) {
          if (checklist.custom?.[def.key]?.done) {
            doneServices += 1;
            preparedServices += 1; // Done implies prepared
          } else if (checklist.custom?.[def.key]?.prepared) {
            preparedServices += 1;
          }
        }
      }
    }
    
    const openTasks = totalServices - preparedServices;
    const progress = totalServices === 0 ? 0 : Math.round((doneServices / totalServices) * 100);
    const preparedProgress = totalServices === 0 ? 0 : Math.round((preparedServices / totalServices) * 100);
    return { totalCustomers, progress, preparedProgress, openTasks };
  }, [activeCustomers, checklists, customDefsByCustomer]);

  // Helper to calculate completion percentage for a customer
  function getCompletionPercentage(customerId: string): number {
    const customDefs = customDefsByCustomer[customerId] || [];
    const totalCount = SERVICES.length + customDefs.length;
    
    if (totalCount === 0) return 0;
    
    const checklist = checklists.find(cl => cl.customerId === customerId);
    if (!checklist) return 0;
    
    let doneCount = 0;
    
    // Count standard services
    for (const s of SERVICES) {
      if (checklist.services[s.key]?.done) doneCount += 1;
    }
    
    // Count custom services
    for (const def of customDefs) {
      if (checklist.custom?.[def.key]?.done) doneCount += 1;
    }
    
    return Math.round((doneCount / totalCount) * 100);
  }

  // Toggle handlers - direct Firestore writes
  async function toggleServicePrepared(customerId: string, service: MarketingServiceKey, prepared: boolean) {
    console.log('🟡 toggleServicePrepared called:', { customerId, service, prepared, ym });
    console.log('🟡 Current state before toggle:', checklists.find(c => c.customerId === customerId)?.services[service]);
    try {
      await setMarketingServicePrepared(customerId, ym, service, prepared);
      console.log('✅ toggleServicePrepared success');
    } catch (e) {
      console.error('❌ toggleServicePrepared failed', e);
    }
  }

  async function toggleServiceCompleted(customerId: string, service: MarketingServiceKey, completed: boolean) {
    console.log('🟢 toggleServiceCompleted called:', { customerId, service, completed, ym });
    console.log('🟢 Current state before toggle:', checklists.find(c => c.customerId === customerId)?.services[service]);
    try {
      await setMarketingServiceCompleted(customerId, ym, service, completed);
      console.log('✅ toggleServiceCompleted success');
    } catch (e) {
      console.error('❌ toggleServiceCompleted failed', e);
    }
  }

  async function toggleCustomServicePrepared(customerId: string, service: string, label: string, prepared: boolean) {
    console.log('🟡 toggleCustomServicePrepared called:', { customerId, service, label, prepared, ym });
    try {
      await setCustomMarketingServicePrepared(customerId, ym, service, label, prepared);
      console.log('✅ toggleCustomServicePrepared success');
    } catch (e) {
      console.error('❌ toggleCustomServicePrepared failed', e);
    }
  }

  async function toggleCustomServiceCompleted(customerId: string, service: string, label: string, completed: boolean) {
    console.log('🟢 toggleCustomServiceCompleted called:', { customerId, service, label, completed, ym });
    try {
      await setCustomMarketingServiceCompleted(customerId, ym, service, label, completed);
      console.log('✅ toggleCustomServiceCompleted success');
    } catch (e) {
      console.error('❌ toggleCustomServiceCompleted failed', e);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Lade Marketing-Services...</div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 min-w-0 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-center sm:text-left">Marketing-Services</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => changeMonth(-1)} className="h-10 px-3 rounded-md border border-white/10 hover:bg-neutral-800">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="px-3 py-2 rounded-md border border-white/10 bg-neutral-900 tabular-nums">
            {ymToLabel(ym)}
          </div>
          <button onClick={() => changeMonth(1)} className="h-10 px-3 rounded-md border border-white/10 hover:bg-neutral-800">
            <ChevronRight className="w-4 h-4" />
          </button>
          {autoFollowNext ? null : (
            <button
              onClick={() => setAutoFollowNext(true)}
              className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 text-gray-400 hover:text-gray-300 hover:border-white/20"
              title="Automatik wieder aktivieren"
            >
              Auto an
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="h-24 flex flex-col items-center justify-center text-center">
          <div className="text-xs leading-tight text-gray-400">Apotheken<br />mit Marketing</div>
          <div className="text-2xl font-semibold tabular-nums">{activeCustomers.length}</div>
        </Card>
        <Card className="h-24 flex flex-col items-center justify-center text-center">
          <div className="text-xs text-gray-400">Aktueller Fortschritt</div>
          <div className="text-2xl font-semibold tabular-nums">{kpis.progress}%</div>
        </Card>
        <Card className="h-24 flex flex-col items-center justify-center text-center">
          <div className="text-xs leading-tight text-gray-400">Offene<br />Aufgaben</div>
          <div className="text-2xl font-semibold tabular-nums">{kpis.openTasks}</div>
        </Card>
      </div>

      {/* Overall Progress Bars */}
      <Card className="p-4 space-y-4">
        {/* Completed Progress */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-400">Abgeschlossen</div>
            <div className="text-sm text-gray-300 tabular-nums">{kpis.progress}%</div>
          </div>
          <div className="h-2 w-full rounded bg-white/10 overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all duration-300 ease-out" style={{ width: `${kpis.progress}%` }} />
          </div>
        </div>
        
        {/* Prepared Progress */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-400">Vorbereitet</div>
            <div className="text-sm text-gray-300 tabular-nums">{kpis.preparedProgress}%</div>
          </div>
          <div className="h-2 w-full rounded bg-white/10 overflow-hidden">
            <div className="h-full bg-amber-500 transition-all duration-300 ease-out" style={{ width: `${kpis.preparedProgress}%` }} />
          </div>
        </div>
      </Card>

      {/* Customer List */}
      {loading && (
        <Card className="p-4 text-gray-400">Lade…</Card>
      )}
      {!loading && activeCustomers.map((c) => {
        const progressPct = getCompletionPercentage(c.id);
        const isExpanded = expanded[c.id] ?? false;
        const toggleExpand = () => setExpanded((prev) => ({ ...prev, [c.id]: !(prev[c.id] ?? false) }));
        const customDefs = customDefsByCustomer[c.id] || [];
        const checklist = checklists.find(cl => cl.customerId === c.id);

        return (
          <Card key={c.id} className="p-3 min-w-0 overflow-hidden">
            {/* Customer Header */}
            <button
              type="button"
              onClick={toggleExpand}
              className="w-full flex items-center justify-between gap-3 mb-2 text-left hover:bg-white/5 rounded-md px-3 pt-3 pb-2 transition-colors min-w-0"
            >
              <div className="min-w-0 flex items-center">
                <h2 className="text-base font-medium truncate leading-[1]">{c.name}</h2>
              </div>
              <div className="flex items-center gap-2 h-full">
                <div className="hidden sm:flex items-center text-xs text-gray-400 leading-[1] whitespace-nowrap shrink-0">
                  {ymToLabel(ym)}
                </div>
                <div className="h-[6px] w-24 sm:w-28 rounded bg-white/10 overflow-hidden shrink-0">
                  <div className="h-full bg-emerald-500" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <div className="text-[10px] text-gray-400 tabular-nums leading-[1]">{progressPct}%</div>
                </div>
              </div>
            </button>

            {/* Services List */}
            {isExpanded && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-1 px-1">
                {SERVICES.map(({ key, label }) => {
                  const service = checklist?.services[key];
                  const prepared = !!service?.prepared;
                  const completed = !!service?.done;
                  
                  // Debug: Log checkbox props for Weber Apotheken
                  if (c.id === 'BmWPmcyvNOGOnMREdOJu') {
                    console.log(`🎯 ${label} (${key}) checkbox props:`, {
                      service,
                      prepared,
                      completed,
                      rawPrepared: service?.prepared,
                      rawCompleted: service?.done
                    });
                  }
                  
                  return (
                    <div
                      key={key}
                      className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 transition-colors border text-sm min-w-0 ${
                        completed ? 'border-emerald-500/30 bg-emerald-500/10' : 
                        prepared ? 'border-amber-500/30 bg-amber-500/10' : 
                        'border-white/10 bg-neutral-900'
                      }`}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="flex items-center gap-2">
                          {label}
                        </span>
                      </span>
                      <TwoCheckbox
                        prepared={prepared}
                        completed={completed}
                        onPreparedChange={(prepared) => toggleServicePrepared(c.id, key, prepared)}
                        onCompletedChange={(completed) => toggleServiceCompleted(c.id, key, completed)}
                      />
                    </div>
                  );
                })}
                
                {/* Custom Services */}
                {customDefs.map(({ key, label }: { key: string; label: string }) => {
                  const service = checklist?.custom?.[key];
                  const prepared = !!service?.prepared;
                  const completed = !!service?.done;
                  
                  return (
                    <div
                      key={`custom-${key}`}
                      className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 transition-colors border text-sm min-w-0 ${
                        completed ? 'border-emerald-500/30 bg-emerald-500/10' : 
                        prepared ? 'border-amber-500/30 bg-amber-500/10' : 
                        'border-white/10 bg-neutral-900'
                      }`}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="flex items-center gap-2">
                          {label}
                        </span>
                      </span>
                      <TwoCheckbox
                        prepared={prepared}
                        completed={completed}
                        onPreparedChange={(prepared) => toggleCustomServicePrepared(c.id, key, label, prepared)}
                        onCompletedChange={(completed) => toggleCustomServiceCompleted(c.id, key, label, completed)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })}
      
      {activeCustomers.length === 0 && (
        <Card className="p-4 text-center text-gray-400">
          Keine Marketing-Services für {ymToLabel(ym)} gefunden.
        </Card>
      )}
    </div>
  );
}
