# rA Meetings

**Meetings strukturieren. Governance verstehen. Gemeinsam Entscheidungen vorbereiten.**

rA Meetings ist ein Produkt von **roleALPHA** für Microsoft Teams und SharePoint. Es begleitet Teams vom Sammeln ihrer Themen über die gemeinsame Bearbeitung bis zu nachvollziehbaren Ergebnissen. Konfigurierbare Meetingvorlagen unterstützen Holacracy-orientierte Abläufe ebenso wie andere Formen der Zusammenarbeit.

Die Anwendung wird in der Microsoft-365-Umgebung Ihrer Organisation installiert. Ein eigener Appserver oder eine zusätzliche SQL-Datenbank ist für den Betrieb nicht erforderlich. Die optionale Verbindung zur **roleALPHA-Governance-Plattform** macht bestehende Governance für Fragen nutzbar und ermöglicht die geprüfte Übergabe von Ergebnissen.

## Was rA Meetings unterstützt

### Themen sammeln und Meetings vorbereiten

Spannungen und Themen können unabhängig von einem einzelnen Meeting erfasst und später einem Meeting zugeordnet werden. Wer den Begriff „Spannungen“ nicht verwendet, kann die Anzeige auf „Agenda“ umstellen. Die gespeicherten Inhalte bleiben dabei erhalten.

Meetings lassen sich mit eigenen Kalenderterminen verknüpfen und als Registerkarte in Teams öffnen. So können berechtigte Personen ihre Themen bereits vor dem gemeinsamen Gespräch vorbereiten. Der Zugriff richtet sich nach den Berechtigungen des SharePoint-Arbeitsbereichs.

### Einen passenden Ablauf gestalten

Tactical, Governance und Reflexion stehen als Startvorlagen bereit. Eigene Vorlagen lassen sich über die Oberfläche erstellen und anpassen:

- Schritte und Reihenfolge
- Zeitboxen und Hinweise für die Moderation
- Optionale Schritte und Unterphasen
- Erlaubte Ergebnistypen

Jedes angelegte Meeting erhält eine eigene Fassung seiner Vorlage. Spätere Änderungen an einer Vorlage verändern bereits angelegte Meetings nicht rückwirkend.

### Vorschläge und Einwände gemeinsam bearbeiten

Die optionale KI unterstützt beim **Proposal Forming**, also dem Ausarbeiten eines Vorschlags, und bei der **Einwandintegration**. Sie kann Formulierungen, Klärungsfragen und mögliche Anpassungen vorschlagen.

Menschen prüfen und übernehmen die Vorschläge. Ob ein Einwand gültig ist, eine Integration ausreicht oder ein Beschluss zustande kommt, entscheidet nicht die KI.

### Bestehende Governance befragen

Mit **Governance fragen** können Anwender Fragen zu Rollen, Zuständigkeiten und Regeln stellen. Dazu liest die App über eine freigegebene Suchfunktion aus roleALPHA und lässt die abgerufenen Inhalte durch den angebundenen KI-Dienst auswerten.

Die Antwort zeigt Quellenverweise und aufklappbare Quelltexte. Ohne passende Quellen wird keine Antwort als gesicherte Governance ausgegeben. Die Suche kann unvollständig sein; die Originaltexte bleiben maßgeblich. Dieser Assistent verändert keine Governance.

Erforderlich sind eine KI-Anbindung und ein kompatibler, ausdrücklich freigegebener roleALPHA-Lesezugriff. Eine reine Verbindung zum Anlegen von Entwürfen genügt nicht.

### Ergebnisse nachvollziehbar festhalten

Transkripte können aus zugänglichen Teams-Besprechungen abgerufen oder als VTT-/TXT-Datei importiert werden. Die optionale KI-Analyse schlägt Ergebnisse mit Bezug auf das Transkript vor. Anwender prüfen diese, bevor sie bestätigt oder weitergegeben werden.

Über die optionale roleALPHA-Anbindung können bestätigte Ergebnisse als Entwürfe angelegt werden, beispielsweise als Meetingprotokoll, Risiko, OKR oder IT-System. Welche Entitäten verfügbar sind, hängt von der eingerichteten roleALPHA-Schnittstelle ab.

Die Agenda beziehungsweise der Spannungsspeicher bleibt Teil von rA Meetings. Die Anwendung funktioniert auch ohne eine Verbindung zur Governance-Plattform.

## Sprachen

Die Oberfläche ist auf **Deutsch, Englisch, Französisch und Spanisch** verfügbar. Anwender wählen ihre Sprache und die Begriffswahl „Spannungen“ oder „Agenda“ selbst. Eigene Inhalte werden durch einen Sprachwechsel nicht automatisch übersetzt.

## Betrieb und Daten

rA Meetings wird als SharePoint-Framework-Paket, kurz **SPFx**, ausgeliefert. Microsoft 365 stellt die App-Dateien bereit; die Anwendung läuft im Browser innerhalb von Teams oder SharePoint.

| Bestandteil | Verarbeitung und Ablage |
| --- | --- |
| Vorlagen, Agenda, Meetings und Ergebnisse | SharePoint-Website Ihrer Organisation |
| Importierte Transkripte | SharePoint-Arbeitsbereich; die Originalaufnahme wird von der App nicht heruntergeladen |
| Kalender- und Transkriptabruf | Direkter Zugriff auf Microsoft Graph mit den Rechten des angemeldeten Benutzers |
| Optionale KI | Direkter Aufruf des administrativ eingerichteten KI-Dienstes |
| Optionale Governance-Verbindung | Direkter Aufruf des eingerichteten roleALPHA-Endpunkts über MCP |
| Sprache und Begriffswahl | Persönliche Einstellung im Browser |

Die App benötigt keinen zentralen roleALPHA-Proxy, keine zusätzliche App-Runtime und kein Power Automate. Bei geschlossener App findet keine automatische Nachbearbeitung statt. Analyse und Übertragung werden bewusst ausgelöst.

Das Standardpaket enthält keine KI- oder roleALPHA-Zieladressen. Diese Dienste müssen die Anmeldung über Microsoft Entra und direkte Browserzugriffe unterstützen. Geheime API-Schlüssel gehören nicht in die Browserkonfiguration.

**Die Datenwege hängen auch von den optionalen Diensten ab.** Wenn Inhalte ausschließlich innerhalb der von Ihrer Organisation kontrollierten Umgebung verarbeitet werden sollen, müssen KI und roleALPHA entsprechend bereitgestellt sein. Eine Verbindung zu einem zentral betriebenen Dienst würde Inhalte an diesen Dienst übertragen. MCP ist dabei das technische Protokoll der roleALPHA-Anbindung; die App bietet keine Auswahl beliebiger MCP-Anbieter.

## Berechtigungen und Aufbewahrung

Ein Arbeitsbereich ist eine gemeinsam genutzte SharePoint-Website. Personen mit Leserechten können dessen Inhalte einschließlich Transkripten und gespeicherten älteren Fassungen lesen. Personen mit Bearbeitungsrechten können gemeinsam Meetings moderieren und Vorlagen pflegen. Für vertrauliche Gruppen werden getrennt berechtigte Websites verwendet. Die Teilnehmerliste eines Teams-Termins ersetzt diese Berechtigungen nicht.

Die App legt zwei Speicherbereiche an:

- `rA Meetings Browser Index`: Verzeichnis der Datensätze und ihrer Versionen.
- `rA Meetings Browser Data`: Dokumentbibliothek mit den gespeicherten Inhalten.

Gleichzeitige Änderungen werden auf Konflikte geprüft. Ältere Inhaltsdateien werden derzeit nicht automatisch bereinigt. Aufbewahrung, Löschung und Wiederherstellung müssen beide Speicherbereiche berücksichtigen.

## Installation

Die Installation erfolgt einmalig durch die Microsoft-365-Administration. Endanwender benötigen keine Entwicklungswerkzeuge.

1. Das [Installationspaket](dist/rolealpha-meetings.sppkg) im SharePoint-App-Katalog bereitstellen.
2. Die App öffnen und den Einrichtungsassistenten durchlaufen: vorhandene SharePoint-Website verwenden oder eine neue erstellen, Zugriff prüfen und Speicherbereiche mit Startvorlagen einrichten.
3. Die optional vorbereitete Einstiegsseite in SharePoint prüfen und veröffentlichen. Bei Bedarf Kalenderzugriff, Teams-Nutzung und optionale Dienste freigeben.
4. Die Einrichtung mit normalen Benutzerkonten prüfen.

Die **[Schritt-für-Schritt-Anleitung für Administratoren](docs/customer-deployment.md)** erklärt die Installation vom ersten Anmelden bis zur Funktionsprüfung. Details für Paketerstellung und Schnittstellenbetrieb stehen im [technischen Anhang](docs/technical-deployment.md).

## Entwicklungsstand

Das Projekt enthält ein baubares SPFx-Installationspaket und automatisierte Tests für Speicherung, Berechtigungen, Meetingabläufe, Übersetzungen und Integrationsverträge.

Die Installation in einer echten Microsoft-365-Umgebung sowie die tatsächlichen roleALPHA-Lese- und Schreibschnittstellen müssen vor der produktiven Einführung geprüft werden. Lokale Simulationen ersetzen diese Abnahme nicht. Teams-Funktionen hängen außerdem von Lizenzen, Besprechungstypen und den Richtlinien Ihrer Organisation ab. Bei Serienterminen ist derzeit ein manueller Import des Transkripts der konkreten Durchführung vorgesehen.

## Lokal entwickeln

Voraussetzung für die Entwicklungswerkzeuge ist Node.js 24. Für den SPFx-Paketbau wird zusätzlich eine projektlokale Node-22-Version installiert; beides wird für die Nutzung des fertigen Pakets nicht benötigt.

```sh
npm ci
npm run spfx:install
npm run check
npm test
npm run build
```

Das fertige Paket liegt unter `dist/rolealpha-meetings.sppkg`. Die optionale Integrationskonfiguration befindet sich in `spfx/customer.config.json`.

```sh
npm run dev
```

Die lokale Vorschau ist unter [http://127.0.0.1:4310](http://127.0.0.1:4310) erreichbar. Sie simuliert SharePoint und hält Änderungen nur bis zum Neuladen im Arbeitsspeicher. Es sind keine produktiven Microsoft-, KI- oder roleALPHA-Dienste verbunden.

Der frühere Express-/SQL-Prototyp bleibt unter `npm run dev:legacy` und `npm run build:legacy` für Entwicklungszwecke erhalten. Er ist kein Bestandteil des SPFx-Pakets. Seine Daten werden nicht automatisch in den gemeinsamen SharePoint-Arbeitsbereich übernommen.

## Lizenzmodell

Für rA Meetings ist folgendes Nutzungsmodell vorgesehen: **kostenlose geschäftliche Nutzung für die eigene Organisation einschließlich der Zusammenarbeit mit ihren Kunden; kein Vertrieb der Software durch Dritte.**

| Nutzung | Vorgesehene Regel |
| --- | --- |
| Interne Meetings, Governance und Zusammenarbeit im Unternehmen | Kostenlos erlaubt, auch für kommerzielle Geschäftstätigkeit |
| Gemeinsame Meetings und Projekte mit eingeladenen Kunden oder Projektpartnern | Erlaubt als Teil der eigenen Zusammenarbeit |
| Einsatz als Hilfsmittel für eine bezahlte Beratung oder Moderation | Erlaubt; vergütet wird die eigene Dienstleistung, nicht die Bereitstellung der Software als Produkt |
| Eigene Anpassungen für diese Nutzung | Erlaubt; die Anpassung macht die Software nicht zum frei vertreibbaren Produkt |
| Verkauf, Unterlizenzierung oder Weitergabe von Quellcode und Installationspaketen an Dritte | Nicht erlaubt, auch nicht kostenlos, sofern keine gesonderte Erlaubnis besteht |
| Vertrieb einer veränderten Fassung oder als White-Label-Produkt | Nicht erlaubt |
| Angebot als eigenständiger gehosteter Softwaredienst für Dritte | Nicht erlaubt; gemeinsame Kundenprojekte sind davon abzugrenzen |

**PolyForm Internal Use 1.0.0** passt als Ausgangspunkt: Sie erlaubt interne geschäftliche Nutzung und entsprechende Änderungen, aber keine Distribution. Die Beteiligung externer Kunden und die dafür technisch notwendige Auslieferung von Browsercode sollen ausdrücklich geregelt werden, damit die Zusammenarbeit nicht versehentlich unter das Weitergabeverbot fällt. [Original-Lizenztext](https://polyformproject.org/licenses/internal-use/1.0.0).

Der konkrete Geltungsbereich und die noch auszuformulierende Erlaubnis zur Kundenmitwirkung stehen im [Lizenzkonzept](docs/licensing-policy.md). Wird der Standardlizenztext verändert, muss die geänderte Lizenz einen eigenen Namen tragen; sie darf nicht als unveränderte PolyForm-Lizenz ausgegeben werden. [Vorgaben des PolyForm-Projekts](https://github.com/polyformproject/polyform-licenses/blob/1.0.0/README.md#license).

**Status:** Das Nutzungsmodell ist festgelegt; ein abschließend geprüfter Lizenztext ist noch nicht Bestandteil des Projekts. Dieser Abschnitt ist eine Beschreibung des vorgesehenen Modells und keine eigenständige Lizenzgewährung. Der frühere Vorschlag Apache 2.0 wird nicht weiterverfolgt. Die Lizenzierung der Dokumentation bleibt separat festzulegen. Rechte an Drittbestandteilen und Marken sowie die Bedingungen von Microsoft und der separaten roleALPHA-Governance-Plattform bleiben unberührt.
