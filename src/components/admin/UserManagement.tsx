import React, { useState } from 'react';
import { Users, Plus, CheckCircle2, Shield, UserCheck, Trash2, KeyRound } from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { User, Role } from '../../types';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';
import { NewUserCredentialsModal } from './NewUserCredentialsModal';
import { getRoleEmoji, ROLE_CONFIG } from '../../lib/roleUtils';

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>(() => StorageService.getUsers());
  const activeUser = StorageService.getActiveUser();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('DIGITADOR');
  const [message, setMessage] = useState<string | null>(null);

  const [credentialsModal, setCredentialsModal] = useState<{
    isOpen: boolean;
    user: User | null;
    tempPassword: string;
    isReset?: boolean;
  }>({
    isOpen: false,
    user: null,
    tempPassword: '',
  });

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    try {
      const created = StorageService.createUser({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        active: true,
      });
      setUsers(StorageService.getUsers());
      setName('');
      setEmail('');
      setCredentialsModal({
        isOpen: true,
        user: created,
        tempPassword: created.password || '',
        isReset: false,
      });
    } catch (err: any) {
      alert(err.message || 'Erro ao cadastrar usuário.');
    }
  };

  const handleResetPassword = (u: User) => {
    try {
      const res = StorageService.resetUserPassword(u.id);
      setUsers(StorageService.getUsers());
      setCredentialsModal({
        isOpen: true,
        user: res.user,
        tempPassword: res.tempPassword,
        isReset: true,
      });
    } catch (err: any) {
      alert(err.message || 'Erro ao redefinir senha.');
    }
  };

  const handleSwitchUser = (u: User) => {
    StorageService.setActiveUser(u);
    window.location.reload();
  };

  const [deleteModalConfig, setDeleteModalConfig] = useState<{
    isOpen: boolean;
    itemType: string;
    itemName: string;
    description?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    itemType: '',
    itemName: '',
    onConfirm: () => {},
  });

  const handleDeleteUser = (u: User) => {
    if (u.id === activeUser.id) {
      alert('Você não pode excluir o seu próprio usuário logado.');
      return;
    }
    if (u.id === 'u-master' || u.email === 'kauaigouveia@gmail.com' || u.role === 'MASTER') {
      alert('O usuário Master principal não pode ser excluído.');
      return;
    }

    setDeleteModalConfig({
      isOpen: true,
      itemType: 'Usuário do Sistema',
      itemName: `${u.name} (${u.email})`,
      description: `O acesso do perfil ${u.role} será revogado e excluído permanentemente do sistema.`,
      onConfirm: () => {
        try {
          StorageService.deleteUser(u.id);
          setUsers(StorageService.getUsers());
          setMessage(`Usuário ${u.name} excluído com sucesso.`);
          setTimeout(() => setMessage(null), 3000);
        } catch (err: any) {
          alert(err.message || 'Erro ao excluir usuário.');
        }
      },
    });
  };

  const roleColors: Record<Role, string> = {
    MASTER: 'bg-rose-100 text-rose-800',
    GESTOR: 'bg-purple-100 text-purple-800',
    GERENTE: 'bg-blue-100 text-blue-800',
    SUPORTE: 'bg-amber-100 text-amber-800',
    DIGITADOR: 'bg-emerald-100 text-emerald-800',
    SIMULACAO: 'bg-indigo-100 text-indigo-800',
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Users className="h-5 w-5 text-blue-600" />
          <span>Usuários & Controle de Acesso (RBAC)</span>
        </h2>
        <p className="text-xs text-slate-500">
          Gerenciamento de operadores e permissões dos perfis: Master 👑, Gestor 🛡️, Gerente 🎯, Suporte 🎧, Digitador ⌨️ e Canal de Simulação 📊
        </p>
      </div>

      {message && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* Form */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Cadastrar Novo Operador
        </h3>
        <form onSubmit={handleCreateUser} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nome *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Carlos Oliveira"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail *</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="usuario@evolvegestao.com.br"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Perfil (Role) *</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value as any)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
            >
              <option value="DIGITADOR">⌨️ DIGITADOR</option>
              <option value="SIMULACAO">📊 SIMULACAO (Canal de Simulação)</option>
              <option value="SUPORTE">🎧 SUPORTE</option>
              <option value="GERENTE">🎯 GERENTE</option>
              <option value="GESTOR">🛡️ GESTOR</option>
              <option value="MASTER">👑 MASTER</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-bold text-white shadow-xs"
            >
              + Salvar Usuário
            </button>
          </div>
        </form>
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Perfil de Acesso</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-center">Alternar Perfil</th>
              <th className="px-4 py-3 text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            {users.map(u => {
              const isActive = activeUser.id === u.id;
              const isProtectedMaster = u.id === 'u-master' || u.email === 'kauaigouveia@gmail.com' || u.role === 'MASTER';
              return (
                <tr key={u.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-bold text-slate-900">
                    {u.name} {isActive && <span className="text-blue-600 text-[10px] ml-1.5 font-bold">(Você)</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-bold text-[10px] border ${
                        ROLE_CONFIG[u.role]?.badgeClass || roleColors[u.role]
                      }`}
                    >
                      <span>{getRoleEmoji(u.role)}</span>
                      <span>{u.role}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-0.5">
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[11px]">
                        <CheckCircle2 className="h-3 w-3" /> Ativo
                      </span>
                      {u.mustChangePassword && (
                        <span className="block text-[9px] text-amber-800 dark:text-amber-300 font-bold bg-amber-50 dark:bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800/60 w-max">
                          🔑 Aguardando 1º Acesso
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {!isActive && (
                      <button
                        onClick={() => handleSwitchUser(u)}
                        className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
                      >
                        Assumir este Perfil
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleResetPassword(u)}
                        className="p-1.5 text-slate-400 hover:text-amber-600 rounded hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
                        title="Redefinir Senha Temporária"
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                      {!isActive && !isProtectedMaster && (
                        <button
                          onClick={() => handleDeleteUser(u)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                          title="Excluir Usuário"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <DeleteConfirmationModal
        isOpen={deleteModalConfig.isOpen}
        onClose={() => setDeleteModalConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={deleteModalConfig.onConfirm}
        itemType={deleteModalConfig.itemType}
        itemName={deleteModalConfig.itemName}
        description={deleteModalConfig.description}
      />

      {credentialsModal.isOpen && credentialsModal.user && (
        <NewUserCredentialsModal
          isOpen={credentialsModal.isOpen}
          onClose={() => setCredentialsModal(prev => ({ ...prev, isOpen: false }))}
          user={credentialsModal.user}
          tempPassword={credentialsModal.tempPassword}
          isReset={credentialsModal.isReset}
        />
      )}
    </div>
  );
};
