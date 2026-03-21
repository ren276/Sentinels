'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, Search, Play, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { apiClient } from '@/lib/api'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/animations'
import { formatTimestamp, relativeTime } from '@/lib/utils'

export default function MLModelsPage() {
  const queryClient = useQueryClient()

  const { data: models = [], isLoading } = useQuery({
    queryKey: ['ml-models'],
    queryFn: () => apiClient.getModels().then(res => res.data),
  })

  const { data: ollama = null } = useQuery({
    queryKey: ['ollama-status'],
    queryFn: () => apiClient.getOllamaStatus().then(res => res.data),
  })

  const trainMutation = useMutation({
    mutationFn: () => apiClient.triggerTraining(),
    onSuccess: () => toast.success('Model retraining triggered for all services'),
    onError: () => toast.error('Failed to start training'),
  })

  if (isLoading) return <div className="p-8 font-mono text-sm text-muted animate-pulse">LOADING ML REGISTRY...</div>

  // Organize models by service
  const serviceModels = models.reduce((acc: any, m: any) => {
    if (!acc[m.service_id]) acc[m.service_id] = []
    acc[m.service_id].push(m)
    return acc
  }, {})

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-mono font-medium tracking-wide mb-1" style={{ color: 'var(--text-primary)' }}>
            MACHINE LEARNING REGISTRY
          </h1>
          <p className="text-sm font-mono tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>
            Anomaly Detectors & Forecasters
          </p>
        </div>
        <div className="flex gap-4">
          <div className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-mono uppercase border ${ollama?.connected ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
            <span className={`w-2 h-2 rounded-full ${ollama?.connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
            OLLAMA {ollama?.connected ? 'ONLINE' : 'OFFLINE'}
          </div>
          <button
            onClick={() => trainMutation.mutate()}
            disabled={trainMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 border rounded font-mono text-xs uppercase transition-colors hover:bg-white/5"
            style={{ borderColor: 'var(--border-strong)' }}
          >
            {trainMutation.isPending ? 'TRIGGERING...' : 'TRIGGER RETRAINING'}
            <Play size={14} />
          </button>
        </div>
      </motion.div>

      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-8">
        {Object.entries(serviceModels).map(([serviceId, sModels]: any) => (
          <motion.div key={serviceId} variants={staggerItem} className="space-y-4">
            <h2 className="font-mono text-sm tracking-widest border-b pb-2 uppercase" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-strong)' }}>
              {serviceId}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sModels.map((model: any) => (
                <div key={model.id} className="p-4 rounded border flex justify-between group" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Brain size={14} style={{ color: 'var(--text-muted)' }} />
                      <span className="font-mono text-sm uppercase text-white">{model.model_type}</span>
                      {model.is_champion && (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-widest bg-yellow-500/20 text-yellow-500 border border-yellow-500/30">
                          Champion
                        </span>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-x-8 gap-y-2 font-mono text-xs mb-4">
                      {Object.entries(model.metrics).slice(0, 4).map(([k, v]: any) => (
                        <div key={k} className="flex flex-col">
                          <span className="text-muted tracking-wide uppercase text-[10px]">{k}</span>
                          <span className="text-secondary">{v.toFixed(4)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="font-mono text-[10px] text-muted flex flex-col gap-1">
                      <span>RUN: {model.mlflow_run_id.slice(0, 12)}...</span>
                      <span>TRAINED: {relativeTime(model.trained_at)}</span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end justify-between">
                     <ShieldCheck size={24} className="opacity-20 group-hover:opacity-100 transition-opacity" style={{ color: model.is_champion ? 'var(--emerald)' : 'var(--text-muted)' }} />
                     {!model.is_champion && (
                       <button className="text-[10px] font-mono tracking-widest uppercase px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-muted hover:text-white transition-colors">
                         Promote
                       </button>
                     )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        ))}
        {Object.keys(serviceModels).length === 0 && (
          <div className="p-12 text-center rounded border border-dashed" style={{ borderColor: 'var(--border-strong)' }}>
            <p className="font-mono text-sm tracking-widest text-muted">NO MODELS FOUND IN REGISTRY</p>
          </div>
        )}
      </motion.div>
    </div>
  )
}
