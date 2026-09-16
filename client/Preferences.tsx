import { t as tr, language, terminology, setPreferences, type Language, type Terminology, terminologyLabel } from './i18n';
export function Preferences() {
 return <div className="preferences"><select aria-label={tr('Sprache')} value={language()} onChange={e => setPreferences({language:e.target.value as Language})}><option value="de">{tr("Deutsch")}</option><option value="en">{tr("English")}</option><option value="fr">{tr("Français")}</option><option value="es">{tr("Español")}</option></select><select aria-label={tr('Bezeichnung des Speichers')} value={terminology()} onChange={e=>setPreferences({terminology:e.target.value as Terminology})}><option value="tensions">{terminologyLabel()}</option><option value="agenda">{tr('Agenda')}</option></select></div>;
}
