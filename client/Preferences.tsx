import { t as tr, language, setPreferences, type Language } from './i18n';
export function Preferences() {
  return (
    <div className="preferences">
      <select
        aria-label={tr('preferences.language')}
        value={language()}
        onChange={e => setPreferences({ language: e.target.value as Language })}
      >
        <option value="de">{tr('preferences.deutsch')}</option>
        <option value="en">{tr('preferences.english')}</option>
        <option value="fr">{tr('preferences.franAis')}</option>
        <option value="es">{tr('preferences.espaOl')}</option>
      </select>
    </div>
  );
}
