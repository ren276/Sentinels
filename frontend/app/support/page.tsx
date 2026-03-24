'use client'
import { motion } from 'framer-motion'
import { Mail, MessageSquare, LifeBuoy, ExternalLink, Terminal, Shield, Book, Globe } from 'lucide-react'

const SUPPORT_CHANNELS = [
  {
    title: 'DIRECT_UPLINK',
    description: 'Immediate assistance from our elite sentinel engineers.',
    icon: MessageSquare,
    status: 'ONLINE',
    action: 'START_SESSION',
    color: 'var(--primary)'
  },
  {
    title: 'COMMS_CHANNEL',
    description: 'Send an encrypted transmission to our support relay.',
    icon: Mail,
    status: 'ACTIVE',
    action: 'SEND_MAIL',
    color: 'var(--secondary)'
  },
  {
    title: 'KNOWLEDGE_BASE',
    description: 'Access the decentralized archive of system operations.',
    icon: Book,
    status: 'INDEXED',
    action: 'BROWSE_ARCHIVE',
    color: 'var(--tertiary)'
  },
  {
    title: 'GLOBAL_RELAY',
    description: 'Check status across all regional sentinel nodes.',
    icon: Globe,
    status: 'NOMINAL',
    action: 'CHECK_STATUS',
    color: 'var(--success)'
  }
]

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-surface p-8 selection:bg-primary selection:text-on-primary">
      <div className="max-w-6xl mx-auto">
        <header className="mb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-3 mb-6"
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <LifeBuoy size={24} />
            </div>
            <span className="mono-label tracking-widest text-primary font-bold">SENTINEL_SUPPORT_MODULE</span>
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-6xl font-sans font-bold text-on-surface mb-8 tracking-tighter"
          >
            System Assistance & <br/>
            <span className="text-primary italic">Technical Support.</span>
          </motion.h1>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-wrap gap-4 items-center"
          >
            <div className="bg-surface-container-high px-4 py-2 border border-outline-variant/30 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="mono-label text-[10px] text-on-surface">OPERATIONAL_STATUS: STABLE</span>
            </div>
            <div className="bg-surface-container-high px-4 py-2 border border-outline-variant/30 flex items-center gap-2">
              <span className="mono-label text-[10px] text-on-surface-variant">RESPONSE_TIME: ~140ms</span>
            </div>
          </motion.div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {SUPPORT_CHANNELS.map((channel, i) => (
            <motion.div
              key={channel.title}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.3 + i * 0.1 }}
              whileHover={{ y: -5 }}
              className="group bg-surface-container-low border border-outline-variant/20 p-8 hover:border-primary/50 transition-all duration-300 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-20 transition-opacity">
                <channel.icon size={120} />
              </div>

              <div className="relative z-10">
                <div className="flex justify-between items-start mb-12">
                  <div className={`p-4 bg-surface-container-high border-0 ghost-border flex items-center justify-center text-on-surface group-hover:text-primary transition-colors`}>
                    <channel.icon size={24} />
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="mono-label text-[10px] opacity-40 mb-1">CHANNEL_STATUS</span>
                    <span className="mono-label text-[10px] text-primary">{channel.status}</span>
                  </div>
                </div>

                <div className="mb-12">
                  <h3 className="text-2xl font-mono font-bold text-on-surface mb-2 group-hover:translate-x-1 transition-transform">{channel.title}</h3>
                  <p className="font-sans text-on-surface-variant text-sm max-w-[280px] leading-relaxed">
                    {channel.description}
                  </p>
                </div>

                <button className="w-full py-4 bg-surface-container-highest border border-outline-variant/30 mono-label text-[11px] font-bold tracking-[0.2em] group-hover:bg-primary group-hover:text-on-primary transition-all flex items-center justify-center gap-3">
                  {channel.action}
                  <ExternalLink size={14} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.section 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 1 }}
          className="mt-32 pt-12 border-t border-outline-variant/20 grid grid-cols-1 lg:grid-cols-3 gap-12"
        >
          <div className="col-span-1">
            <h4 className="mono-label text-[10px] text-primary mb-4 tracking-widest uppercase">Emergency Protocol</h4>
            <p className="text-on-surface-variant text-sm leading-relaxed mb-6 font-sans">
              In the event of a Grade-1 system cascade failure, bypass standard support channels and activate the Emergency Neural Link immediately.
            </p>
            <button className="flex items-center gap-2 text-error font-mono text-[10px] hover:gap-4 transition-all">
              <Shield size={14} />
              ACTIVATING EMERGENCY OVERRIDE
            </button>
          </div>

          <div className="col-span-2 bg-surface-container-highest/30 p-8 border border-outline-variant/10">
             <div className="flex items-center gap-2 mb-6">
               <Terminal size={14} className="text-primary" />
               <span className="mono-label text-[10px] text-on-surface">SYS_LOGS_DIAGNOSTICS</span>
             </div>
             <div className="font-mono text-[10px] text-on-surface-variant uppercase space-y-1">
               <p className="flex gap-4"><span className="text-primary">[OK]</span> INITIALIZING GLOBAL SUPPORT NODES...</p>
               <p className="flex gap-4"><span className="text-primary">[OK]</span> CONNECTION ESTABLISHED WITH SENTINEL_HQ</p>
               <p className="flex gap-4"><span className="text-primary">[OK]</span> AUTHENTICATING OPERATOR PRIVILEGES</p>
               <p className="flex gap-4 animate-pulse"><span className="text-secondary">[WAIT]</span> AWAITING COMMAND_INPUT...</p>
             </div>
          </div>
        </motion.section>

        <footer className="mt-32 mb-12 text-center opacity-30 font-mono text-[9px] uppercase tracking-widest">
          © 2026 SENTINEL MULTI-AGENT SYSTEMS. ALL RIGHTS RESERVED.
        </footer>
      </div>
    </div>
  )
}
