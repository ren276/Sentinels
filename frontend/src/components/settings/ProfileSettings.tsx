'use client'
import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { apiClient } from '@/lib/api'
import { Shield, Lock, Trash2, Github, Mail, Globe, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

export function ProfileSettings() {
  const { user, setUser } = useAuthStore()
  
  const [displayName, setDisplayName] = useState(user?.username || '')
  const [email, setEmail] = useState(user?.email || '')
  const [location, setLocation] = useState('US-EAST-1')
  
  useEffect(() => {
    if (user) {
      setDisplayName(user.username || '')
      setEmail(user.email || '')
    }
  }, [user])

  const handleUpdateProfile = async (field: 'username' | 'email', value: string) => {
    if (!user) return
    if (user[field] === value) return // no change
    try {
      const { data } = await apiClient.updateUser(user.user_id || 'me', { [field]: value })
      setUser(data)
      toast.success('Profile updated successfully')
    } catch {
      toast.error('Failed to update profile')
    }
  }

  return (
    <div className="space-y-8 animate-fade-in max-w-2xl">
      <div className="flex items-center gap-6">
        <div className="w-20 h-20 bg-surface-container-high flex flex-shrink-0 items-center justify-center ghost-border overflow-hidden">
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <span className="font-mono text-2xl text-primary">
              {displayName.substring(0, 2).toUpperCase() || 'AD'}
            </span>
          )}
        </div>
        <div>
          <h2 className="font-mono text-2xl text-on-surface font-medium mb-1">{displayName || 'Operator'}</h2>
          <div className="mono-label text-on-surface-variant flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-primary rounded-full shadow-[0_0_8px_rgba(219,252,255,0.4)]" />
            SYSTEM IDENTITY ACTIVE
          </div>
        </div>
      </div>

      <div className="bg-surface-container-low p-6 space-y-6">
        {user?.provider === 'github' && (
           <div className="flex items-center justify-between">
             <div className="flex flex-col">
               <span className="mono-label text-on-surface-variant mb-1">GITHUB</span>
               <span className="text-sm font-sans text-on-surface">Managed by GitHub OAuth</span>
             </div>
             <div className="bg-surface-container p-2 border border-outline-variant/20 rounded-full">
               <Shield className="text-on-surface" size={18} />
             </div>
           </div>
        )}
        
        <div className="space-y-2 group">
          <span className="mono-label text-on-surface-variant flex items-center gap-2"><Mail size={12}/> System Email</span>
          <input 
             className="w-full bg-transparent border-b border-outline-variant/30 py-2 font-mono text-sm text-on-surface focus:border-primary outline-none transition-colors"
             value={email}
             onChange={(e) => setEmail(e.target.value)}
             onBlur={() => handleUpdateProfile('email', email)}
          />
        </div>

        <div className="space-y-2">
          <span className="mono-label text-on-surface-variant">Display Name</span>
          <input 
             className="w-full bg-surface-container border-0 px-4 py-3 font-sans text-sm text-on-surface outline-none ghost-border ghost-border-focus"
             value={displayName}
             onChange={(e) => setDisplayName(e.target.value)}
             onBlur={() => handleUpdateProfile('username', displayName)}
          />
        </div>

        <div className="space-y-2">
          <span className="mono-label text-on-surface-variant flex items-center gap-2"><Globe size={12}/> Node Location</span>
          <select 
             className="w-full bg-surface-container border-0 px-4 py-3 font-mono text-sm text-on-surface outline-none ghost-border ghost-border-focus appearance-none"
             value={location}
             onChange={(e) => setLocation(e.target.value)}
          >
            <option value="US-EAST-1">US-EAST-1 (N. Virginia)</option>
            <option value="EU-WEST-1">EU-WEST-1 (Ireland)</option>
            <option value="AP-NORTHEAST-1">AP-NORTHEAST-1 (Tokyo)</option>
          </select>
        </div>
      </div>

      <div>
        <h3 className="mono-label text-on-surface-variant mb-4">METADATA CLUSTERS</h3>
        <div className="flex flex-wrap gap-3">
           <div className="bg-surface-container-low px-4 py-1.5 flex items-center gap-2">
             <span className="w-1.5 h-1.5 bg-primary" />
             <span className="mono-label text-on-surface">ROLE: {user?.role || 'OPERATOR'}</span>
           </div>
           <div className="bg-surface-container-low px-4 py-1.5 flex items-center gap-2">
             <span className="w-1.5 h-1.5 bg-primary" />
             <span className="mono-label text-on-surface">SCOPE: GLOBAL</span>
           </div>
           <div className="bg-surface-container-low px-4 py-1.5 flex items-center gap-2">
             <span className="w-1.5 h-1.5 bg-primary-fixed-dim" />
             <span className="mono-label text-on-surface">CLEARANCE: LEVEL_3</span>
           </div>
        </div>
      </div>
    </div>
  )
}

export function SecuritySettings() {
  const { user, clearAuth } = useAuthStore()
  
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [deactivateText, setDeactivateText] = useState('')

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    try {
      await apiClient.changePassword(currentPassword, newPassword)
      toast.success('Password updated successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      toast.error('Failed to update password')
    }
  }

  const handleDeactivate = async () => {
    if (deactivateText !== 'DEACTIVATE') return
    try {
      await apiClient.deleteUser(user?.user_id || 'me')
      clearAuth()
      window.location.href = '/login'
    } catch {
      toast.error('Failed to deactivate account')
    }
  }

  const isOAuth = user?.provider === 'github' || user?.provider === 'google' || user?.provider === 'microsoft'
  const passStrength = Math.min(5, (newPassword.length > 7 ? 1 : 0) + (/[A-Z]/.test(newPassword) ? 1 : 0) + (/[a-z]/.test(newPassword) ? 1 : 0) + (/[0-9]/.test(newPassword) ? 1 : 0) + (/[^A-Za-z0-9]/.test(newPassword) ? 1 : 0))

  return (
    <div className="space-y-8 animate-fade-in max-w-2xl">
      <div className="bg-surface-container-low p-6 flex justify-between items-center">
         <div>
           <div className="flex items-center gap-2 mb-1">
             <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 text-[10px] font-mono tracking-widest uppercase flex items-center gap-1"><CheckCircle2 size={10}/> ENABLED</span>
             <span className="text-[10px] font-mono tracking-widest uppercase text-on-surface-variant">NODE_SECURITY</span>
           </div>
           <div className="text-sm font-sans text-on-surface">System security nominal. All access keys rotated.</div>
         </div>
         <Shield size={32} className="text-primary-fixed-dim opacity-50" />
      </div>

      <div className="bg-surface-container-low p-6">
         <h3 className="mono-label text-on-surface-variant mb-6">SECURITY CREDENTIALS</h3>
         
         {isOAuth ? (
           <div className="bg-surface-container-lowest p-6 border border-outline-variant/20 flex items-center gap-4">
             <Lock className="text-on-surface-variant" size={24} />
             <div>
               <div className="text-sm font-sans text-on-surface mb-1">Password Control</div>
               <div className="text-[10px] font-mono text-primary uppercase tracking-widest">Managed by {user?.provider}</div>
               <a href="#" className="text-xs text-on-surface-variant hover:text-on-surface underline mt-2 inline-block">Manage account settings externally</a>
             </div>
           </div>
         ) : (
           <form onSubmit={handleChangePassword} className="space-y-4">
             <div>
               <input className="w-full bg-surface-container-lowest border-0 px-4 py-3 font-sans text-sm text-on-surface outline-none ghost-border ghost-border-focus" type="password" placeholder="Current password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} required />
             </div>
             <div>
               <input className="w-full bg-surface-container-lowest border-0 px-4 py-3 font-sans text-sm text-on-surface outline-none ghost-border ghost-border-focus mb-2" type="password" placeholder="New password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} required />
               {newPassword && (
                 <div className="flex gap-1 mb-4">
                   {[1,2,3,4,5].map(i => <div key={i} className={`h-1 flex-1 rounded-full ${i <= passStrength ? (passStrength < 3 ? 'bg-error' : passStrength < 5 ? 'bg-amber-400' : 'bg-primary') : 'bg-surface-container-highest'}`} />)}
                 </div>
               )}
             </div>
             <div>
               <input className="w-full bg-surface-container-lowest border-0 px-4 py-3 font-sans text-sm text-on-surface outline-none ghost-border ghost-border-focus" type="password" placeholder="Confirm new password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required />
             </div>
             <button className="bg-surface-container-highest text-on-surface px-6 py-2 mono-label font-bold hover:bg-surface-container-lowest transition-colors ghost-border block ml-auto mt-4 disabled:opacity-50" disabled={!currentPassword || !newPassword || passStrength < 3 || newPassword !== confirmPassword}>
               UPDATE PASSWORD
             </button>
           </form>
         )}
      </div>

      <div className="ghost-border border-error/50 bg-error-container/10 p-6 mt-12">
         <h3 className="mono-label text-error mb-2 tracking-widest flex items-center gap-2"><Trash2 size={14}/> DEACTIVATE NODE</h3>
         <p className="text-sm font-sans text-on-surface-variant mb-4">Deactivating your account will permanently revoke access and delete associated local data. This action cannot be easily undone.</p>
         
         <div className="flex gap-4 items-center">
           <input className="flex-1 bg-surface-container border-0 px-4 py-3 font-mono text-sm text-error outline-none ghost-border ghost-border-focus placeholder:text-error/30" placeholder="Type 'DEACTIVATE' to confirm" value={deactivateText} onChange={e=>setDeactivateText(e.target.value)} />
           <button className="bg-error text-surface px-6 py-3 mono-label font-bold disabled:opacity-50 transition-opacity" disabled={deactivateText !== 'DEACTIVATE'} onClick={handleDeactivate}>
              {user?.role === 'admin' ? 'DELETE PERMANENTLY' : 'DEACTIVATE'}
           </button>
         </div>
      </div>
    </div>
  )
}
