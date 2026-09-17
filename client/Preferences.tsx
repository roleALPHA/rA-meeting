import {
  t as tr,
  language,
  terminology,
  setPreferences,
  type Language,
  type Terminology,
  terminologyLabel,
} from './i18n';
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
      <select
        aria-label={tr('preferences.backlogTerminology')}
        value={terminology()}
        onChange={e => setPreferences({ terminology: e.target.value as Terminology })}
      >
        <option value="tensions">{terminologyLabel()}</option>
        <option value="agenda">{tr('preferences.agenda')}</option>
      </select>
    </div>
  );
}
