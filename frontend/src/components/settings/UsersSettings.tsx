'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { UserPlus, AlertTriangle, MoreVertical, ShieldCheck, Activity } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { formatTimestamp } from '@/lib/utils'
import { toast } from 'sonner'

export function UsersSettings() {
  const queryClient = useQueryClient()
  const { data: usersData = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient.getUsers().then(res => res.data),
  })
  
  const users = Array.isArray(usersData) ? usersData : []

  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserRole, setNewUserRole] = useState('user')
  const [isAdding, setIsAdding] = useState(false)

  const { mutate: createUser, isPending: creating } = useMutation({
    mutationFn: () => apiClient.createUser({ username: newUserEmail.split('@')[0], email: newUserEmail, role: newUserRole, password: 'TempPassword123!' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User invitation executed')
      setNewUserEmail('')
      setIsAdding(false)
    },
    onError: () => toast.error('Failed to create user')
  })

  const { mutate: updateUser } = useMutation({
    mutationFn: ({ id, data }: { id: string, data: any }) => apiClient.updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User status updated')
    }
  })

  const pendingUsers = users.filter((u: any) => !u.is_active)

  if (isLoading) return <div className="animate-pulse font-mono text-xs text-primary tracking-widest uppercase p-8">INITIALIZING_SESSION_DATA...</div>

  return (
    <div className="w-full animate-fade-in px-8 py-10">
      
      {/* Header Section: Cleaner & More Professional */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 border-b border-outline-variant/20 pb-8 gap-6">
        <div>
          <h1 className="text-3xl font-sans font-black tracking-tight text-on-surface uppercase italic">
            Management<span className="text-primary ml-2">Protocol_04</span>
          </h1>
          <p className="text-xs font-mono text-on-surface-variant tracking-[0.2em] mt-2 uppercase opacity-60">System Operator Hierarchy & Provisioning</p>
        </div>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className={`px-6 py-3 font-mono text-xs uppercase tracking-widest font-bold flex items-center gap-3 transition-all ${isAdding ? 'bg-surface-container-highest text-on-surface' : 'bg-primary text-on-primary hover:shadow-[0_0_20px_rgba(33,150,243,0.3)]'}`}
        >
          {isAdding ? 'CLOSE_PANEL' : <><UserPlus size={16} /> NEW_OPERATOR</>}
        </button>
      </div>

      <div className="grid grid-cols-12 gap-8">
        
        {/* Left Section: Operator Registry */}
        <div className={`${isAdding ? 'col-span-12 lg:col-span-8' : 'col-span-12'} transition-all duration-500`}>
          
          {/* Stats Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatSmall label="TOTAL_NODES" value={users.length} />
            <StatSmall label="ACTIVE_SES" value={users.filter((u:any)=>u.is_active).length} color="text-primary" />
            <StatSmall label="PENDING_AUTH" value={pendingUsers.length} color={pendingUsers.length > 0 ? "text-error" : "text-on-surface-variant"} />
            <StatSmall label="SYS_INTEGRITY" value="COMPLIANT" />
          </div>

          <div className="bg-surface-container-low border border-outline-variant/10 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-surface-container/50 border-b border-outline-variant/10">
                  <tr>
                    <th className="px-6 py-4 font-mono text-[10px] tracking-widest uppercase text-on-surface-variant">Operator_Identity</th>
                    <th className="px-6 py-4 font-mono text-[10px] tracking-widest uppercase text-on-surface-variant">Clearance</th>
                    <th className="px-6 py-4 font-mono text-[10px] tracking-widest uppercase text-on-surface-variant text-right">Access_Status</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/5">
                  {users.map((u: any) => (
                    <tr key={u.user_id} className={`hover:bg-primary/5 transition-colors ${!u.is_active ? 'bg-error/5' : ''}`}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 flex items-center justify-center font-mono text-xs border ${u.role === 'admin' ? 'border-error/40 text-error bg-error/5' : 'border-primary/40 text-primary bg-primary/5'}`}>
                            {u.username.substring(0,2).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-on-surface">{u.username}</div>
                            <div className="text-[10px] font-mono text-on-surface-variant/40 lowercase tracking-tight">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-[10px] font-mono tracking-widest uppercase ${u.role === 'admin' ? 'text-error font-extrabold' : 'text-primary'}`}>
                          {u.role === 'admin' ? 'L4_ROOT' : 'L2_ANALYST'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                           <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-primary' : 'bg-error'}`} />
                           <span className={`text-[10px] font-mono uppercase tracking-widest ${u.is_active ? 'text-primary' : 'text-error'}`}>
                             {u.is_active ? 'ENABLED' : 'REVOKED'}
                           </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                         <div className="flex justify-end gap-1">
                            {u.is_active ? (
                              <button onClick={() => updateUser({id: u.user_id, data: {is_active: false}})} className="p-2 hover:bg-error/10 text-error transition-colors rounded opacity-20 hover:opacity-100" title="REVOKE_ACCESS">
                                <ShieldCheck size={16} />
                              </button>
                            ) : (
                              <button onClick={() => updateUser({id: u.user_id, data: {is_active: true}})} className="p-2 hover:bg-primary/10 text-primary transition-colors rounded" title="GRANT_ACCESS">
                                <Activity size={16} />
                              </button>
                            )}
                         </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Section: Provisioning Panel */}
        <AnimatePresence>
          {isAdding && (
            <motion.div 
              initial={{ x: 300, opacity: 0 }} 
              animate={{ x: 0, opacity: 1 }} 
              exit={{ x: 300, opacity: 0 }}
              className="col-span-12 lg:col-span-4"
            >
              <div className="bg-surface-container-high border border-primary/20 p-8 shadow-xl sticky top-8">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-sm font-bold uppercase tracking-widest font-mono text-primary flex items-center gap-2">
                    <span className="w-2 h-2 bg-primary"></span>
                    PROVISION_NODE
                  </h2>
                </div>
                
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono uppercase text-on-surface-variant font-bold">Identity_Link (Email)</label>
                    <input 
                      className="w-full bg-surface-container-highest border-b border-outline-variant/30 px-4 py-3 font-mono text-sm text-on-surface outline-none focus:border-primary transition-colors placeholder:opacity-20" 
                      placeholder="node_id@sentinel.sys"
                      value={newUserEmail}
                      onChange={e=>setNewUserEmail(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-mono uppercase text-on-surface-variant font-bold">Clearance_Level</label>
                    <select 
                      className="w-full bg-surface-container-highest px-4 py-3 font-mono text-sm uppercase text-on-surface outline-none cursor-pointer border-b border-outline-variant/30 focus:border-primary transition-colors"
                      value={newUserRole}
                      onChange={e=>setNewUserRole(e.target.value)}
                    >
                      <option value="user">L2_ANALYST</option>
                      <option value="manager">L3_ARCHITECT</option>
                      <option value="admin">L4_ROOT_ADMIN</option>
                    </select>
                  </div>

                  <div className="pt-6">
                    <button 
                      onClick={() => createUser()} 
                      disabled={creating || !newUserEmail}
                      className="w-full bg-primary hover:bg-primary-fixed text-on-primary p-4 text-[10px] font-mono font-bold tracking-[0.3em] uppercase transition-all disabled:opacity-50"
                    >
                      {creating ? 'EXECUTING...' : 'AUTHORIZE_PROVISION'}
                    </button>
                  </div>
                </div>

                <div className="mt-8 pt-8 border-t border-outline-variant/10">
                  <div className="text-[9px] font-mono text-on-surface-variant uppercase space-y-2 opacity-50">
                    <p>// NEW NODES ARE CREATED IN REVOKED STATE BY DEFAULT</p>
                    <p>// SMTP_AUTH TRIGGERED ON SUCCESSFUL PROVISIONING</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function StatSmall({ label, value, color = "text-on-surface" }: { label: string, value: any, color?: string }) {
  return (
    <div className="bg-surface-container-low border border-outline-variant/10 p-4">
      <div className="text-[9px] font-mono text-on-surface-variant uppercase tracking-widest mb-1">{label}</div>
      <div className={`text-xl font-mono font-bold ${color}`}>{value}</div>
    </div>
  )
}

