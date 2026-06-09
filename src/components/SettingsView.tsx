import { FormEvent, useState } from 'react';
import { Building2, Globe2, MapPin, Phone, Save } from 'lucide-react';
import { api } from '../lib/api';
import { ClinicData } from '../hooks/useAuth';
import { COMMON_TIMEZONES, DEFAULT_TIMEZONE } from '../types';
import { PageHeader } from './ui/PageHeader';

interface SettingsViewProps {
  clinic: ClinicData;
  onSaved: () => Promise<void>;
}

export function SettingsView({ clinic, onSaved }: SettingsViewProps) {
  const [name, setName] = useState(clinic.name ?? '');
  const [address, setAddress] = useState(clinic.address ?? '');
  const [whatsappNumber, setWhatsappNumber] = useState(clinic.whatsappNumber ?? '');
  const [timezone, setTimezone] = useState(clinic.timezone ?? DEFAULT_TIMEZONE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      await api.put(`/api/clinics/${clinic.id}`, {
        name,
        address,
        whatsappNumber,
        timezone,
      });
      await onSaved();
      setSaved(true);
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? 'Nao foi possivel salvar as configuracoes.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administracao"
        title="Configuracoes da clinica"
        description="Atualize dados usados no painel, nos agendamentos e nos atendimentos automaticos."
      />

      <form onSubmit={handleSubmit} className="bg-white border border-slate-100 rounded shadow-sm shadow-slate-100/50 overflow-hidden">
        <div className="p-6 md:p-8 space-y-7">
          {error && (
            <div className="rounded border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
              {error}
            </div>
          )}
          {saved && (
            <div className="rounded border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
              Configuracoes salvas.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Field label="Nome da clinica" icon={<Building2 size={16} />}>
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded outline-none transition-all font-bold text-sm shadow-inner"
                placeholder="Nome exibido no painel"
              />
            </Field>

            <Field label="WhatsApp principal" icon={<Phone size={16} />}>
              <input
                value={whatsappNumber}
                onChange={(event) => setWhatsappNumber(event.target.value)}
                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded outline-none transition-all font-bold text-sm shadow-inner"
                placeholder="DDD + numero"
              />
            </Field>
          </div>

          <Field label="Endereco" icon={<MapPin size={16} />}>
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded outline-none transition-all font-bold text-sm shadow-inner"
              placeholder="Rua, numero, bairro e cidade"
            />
          </Field>

          <Field label="Fuso horario" icon={<Globe2 size={16} />}>
            <select
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded outline-none transition-all font-bold text-sm shadow-inner cursor-pointer"
            >
              {COMMON_TIMEZONES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="px-6 md:px-8 py-5 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            disabled={submitting}
            className="px-8 py-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white font-bold rounded shadow-sm transition-all active:scale-[0.98] flex items-center gap-2 text-sm"
          >
            {submitting ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Save size={16} />
                Salvar alteracoes
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
        <span className="text-emerald-500">{icon}</span>
        {label}
      </label>
      {children}
    </div>
  );
}
