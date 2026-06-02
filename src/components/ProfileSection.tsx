import React, { useState } from 'react';
import { User, Mail, Save, Edit2 } from 'lucide-react';
import { AppState } from '../types';
import { updateAuthAccountName } from '../supabase';

interface ProfileSectionProps {
  state: AppState;
  updateState: (updater: (prev: AppState) => AppState) => void;
  onOpenSettings: () => void;
}

export default function ProfileSection({ state, updateState, onOpenSettings }: ProfileSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(state.userProfile.name);

  const handleSave = async () => {
    console.log('Saving profile name:', name);
    updateState(prev => ({
        ...prev,
        userProfile: { ...prev.userProfile, name }
    }));
    try {
        await updateAuthAccountName(state.userProfile.email, name);
    } catch (err) {
        console.error("Failed to sync name to auth_accounts", err);
    }
    setIsEditing(false);
  };

  return (
    <div className="bg-zinc-900 rounded-3xl p-6 shadow-xl border border-zinc-800">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-white">Profile</h2>
        <button onClick={() => setIsEditing(!isEditing)} className="text-indigo-400">
          {isEditing ? 'Cancel' : <Edit2 size={18} />}
        </button>
      </div>

      <div className="flex flex-col items-center mb-6">
        <div className="w-24 h-24 bg-zinc-700 rounded-full flex items-center justify-center mb-4 text-zinc-400">
          <User size={48} />
        </div>
        {isEditing ? (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-zinc-800 text-white rounded-lg px-4 py-2 text-center"
          />
        ) : (
          <h3 className="text-2xl font-bold text-white">{state.userProfile.name}</h3>
        )}
      </div>

      <div className="flex items-center gap-3 bg-zinc-800 p-4 rounded-xl mb-6">
        <Mail className="text-zinc-500" />
        <span className="text-zinc-300">{state.userProfile.email}</span>
      </div>

      <button
        onClick={onOpenSettings}
        className="w-full bg-zinc-800 text-zinc-300 py-3 rounded-xl font-semibold mb-3 hover:bg-zinc-700"
      >
        Settings
      </button>

      {isEditing && (
        <button
          onClick={handleSave}
          className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2"
        >
          <Save size={18} />
          Save Changes
        </button>
      )}
    </div>
  );
}
