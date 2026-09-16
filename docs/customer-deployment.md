# roleALPHA Meetings installieren: Schritt für Schritt

Diese Anleitung führt Sie durch die erstmalige Installation in Ihrer Microsoft-365-Umgebung. Sie benötigen keine Programmierkenntnisse und müssen keine Befehle ausführen. Sie installieren ein fertiges Paket über die Verwaltungsoberflächen von Microsoft.

roleALPHA Meetings läuft innerhalb von SharePoint und Microsoft Teams. Meetings, Vorlagen, Spannungen beziehungsweise Agendapunkte und Ergebnisse werden in einer SharePoint-Website Ihrer Organisation gespeichert. Ein eigener Appserver, eine Datenbankinstallation oder Power Automate ist dafür nicht erforderlich.

Nach der Paketbereitstellung übernimmt ein Einrichtungsassistent die Websiteauswahl, die Speicherbereiche und Startvorlagen. Eine neue Website kann er bei ausreichenden Berechtigungen ebenfalls erstellen. Der Assistent startet beim ersten Öffnen eines noch nicht eingerichteten Arbeitsbereichs; später finden Sie ihn unter **Verbindungen → Einrichtungsassistent öffnen**.

Führen Sie zuerst die Schritte 1 bis 6 durch. Danach können Sie die App in SharePoint verwenden. Die Schritte 7 bis 9 ergänzen Kalenderzugriff und Teams. KI und die Verbindung zur roleALPHA-Governance-Plattform sind optional und werden in Schritt 10 erklärt.

Microsoft ändert gelegentlich Menünamen. Deshalb stehen an wichtigen Stellen auch die englischen Bezeichnungen. Stand der Anleitung: 16. September 2026. Die Installation wurde noch nicht in einer echten Microsoft-365-Umgebung abgenommen; die Prüfungen in Schritt 11 sind vor der allgemeinen Freigabe erforderlich.

## 1. Unterlagen und Berechtigungen bereitlegen

1. Speichern Sie die bereitgestellte Datei **rolealpha-meetings.sppkg** auf Ihrem Computer. Die Endung `.sppkg` bezeichnet ein Installationspaket für SharePoint. Entpacken Sie die Datei nicht. Im Projekt liegt sie im Ordner `dist`.
2. Halten Sie Ihr Microsoft-365-Administratorkonto bereit. Verwenden Sie ein Geschäftskonto Ihrer Organisation.
3. Prüfen Sie, wer die folgenden Aufgaben übernehmen darf. Das können unterschiedliche Personen sein:

| Aufgabe | Benötigte Berechtigung |
| --- | --- |
| Paket in SharePoint bereitstellen | SharePoint-Administration und Zugriff auf den organisationsweiten App-Katalog |
| Speicherbereich in einer Website einrichten | Websitebesitzer mit Berechtigung zum Verwalten von Listen |
| Microsoft-Graph-Berechtigungen genehmigen | Globale Administration für die Microsoft-API-Freigabe |
| App für Teams-Benutzer freigeben | Teams-Administration |

4. Vereinbaren Sie einen ersten Test mit einer kleinen Benutzergruppe. Benötigt werden Konten mit SharePoint-Zugriff; für die Teams-Schritte zusätzlich Teams-Zugriff.
5. Notieren Sie, wer später die Websiteberechtigungen und die Aufbewahrung der Daten betreut.

**Prüfung:** Die Paketdatei liegt vor und für jede Aufgabe ist eine berechtigte Person verfügbar. Ist ein Verwaltungsbereich nicht sichtbar, lassen Sie die entsprechende Person diesen Teil durchführen.

## 2. SharePoint-Website als Arbeitsbereich auswählen

Ein **Arbeitsbereich** ist hier die SharePoint-Website, in der eine Gruppe ihre Meetingdaten gemeinsam ablegt.

1. Öffnen Sie SharePoint über das Microsoft-365-App-Menü.
2. Öffnen Sie die Website der vorgesehenen Gruppe. Wenn Sie bereits ein Team in Teams verwenden, können Sie dessen SharePoint-Website über den Dateibereich des Kanals und **In SharePoint öffnen** erreichen.
3. Für einen neuen Arbeitsbereich können Sie später im Einrichtungsassistenten **Neue SharePoint-Website erstellen** wählen. Zum erstmaligen Öffnen der App verwenden Sie zunächst eine vorhandene Website mit dem Webpart aus Schritt 5 oder die freigegebene persönliche Teams-App aus Schritt 8. Die App startet nicht allein durch das Hochladen des Pakets. Alternativ lassen Sie eine neue Website über **SharePoint-Verwaltung → Aktive Websites → Erstellen** anlegen, wenn Organisationsrichtlinien besondere Vorlagen oder Vertraulichkeitskennzeichnungen verlangen.
4. Kopieren Sie die Adresse der Website. Beispiel: `https://ihreorganisation.sharepoint.com/sites/Meetingteam`. Verwenden Sie die Websiteadresse ohne einen angehängten Seiten- oder Dateinamen wie `/SitePages/Start.aspx`.
5. Öffnen Sie auf der Website **Zahnrad → Websiteberechtigungen**. Prüfen Sie Besitzer, Mitglieder und Besucher sowie eventuell vorhandene zusätzliche Freigaben.
6. Geben Sie Bearbeitungsrechte nur den Personen, die Meetings, Vorlagen und Inhalte gemeinsam bearbeiten sollen. Die App benötigt dafür die Rechte zum Hinzufügen, Bearbeiten und Löschen von Elementen. Personen mit Leserechten können Inhalte ansehen.

**Wichtig:** Alle Personen mit Zugriff auf die gespeicherten Inhalte können auch Transkripte und ältere gespeicherte Fassungen lesen. Die Teilnehmerliste eines Teams-Termins begrenzt diesen Zugriff nicht. Für vertrauliche Gruppen verwenden Sie eine eigene Website mit entsprechend eingeschränkten Berechtigungen.

**Prüfung:** Sie haben die Websiteadresse notiert und der zugriffsberechtigte Personenkreis ist bewusst festgelegt.

## 3. Den SharePoint-App-Katalog öffnen

Der **App-Katalog** ist die zentrale Ablage für zusätzliche SharePoint-Apps Ihrer Organisation. Er ist nicht die Website aus Schritt 2.

1. Öffnen Sie das [Microsoft-365 Admin Center](https://admin.microsoft.com/) und melden Sie sich an.
2. Wählen Sie gegebenenfalls **Alle anzeigen**, dann unter **Admin Center** den Eintrag **SharePoint**.
3. Öffnen Sie **Weitere Funktionen / More features**.
4. Klicken Sie bei **Apps** auf **Öffnen / Open**.
5. Es erscheint **Apps verwalten / Manage apps**. Falls zunächst die Einrichtung eines App-Katalogs angeboten wird, lassen Sie die SharePoint-Administration diese Einrichtung abschließen und öffnen Sie den Bereich danach erneut. Erstellen Sie keinen zusätzlichen Website-App-Katalog als Ersatz.

**Prüfung:** Sie sehen eine App-Verwaltung mit der Möglichkeit **Hochladen / Upload**. Microsoft beschreibt diesen Zugang in der [Anleitung zum App-Katalog](https://learn.microsoft.com/en-us/sharepoint/use-app-catalog).

## 4. Installationspaket hochladen und aktivieren

1. Wählen Sie **Hochladen / Upload** und anschließend die Datei `rolealpha-meetings.sppkg`.
2. Lesen Sie den angezeigten Dialog zur Aktivierung. Falls die App bereits vorhanden ist, prüfen Sie zuerst, ob Sie bewusst ein Update installieren möchten; siehe Abschnitt „Später aktualisieren“.
3. Für die hier beschriebene Bereitstellung wählen Sie **Diese App aktivieren und allen Websites hinzufügen / Enable this app and add it to all sites**. Damit wird der Baustein organisationsweit verfügbar. Meetingdaten werden dadurch nicht automatisch angelegt oder für andere Websites freigegeben. Falls Ihre Organisation diese breite Verfügbarkeit nicht erlaubt, klären Sie vor dem Fortfahren eine eingeschränkte Bereitstellung mit der SharePoint-Administration.
4. Bestätigen Sie mit **App aktivieren / Enable app** beziehungsweise **Hinzufügen / Add**. Das Hinzufügen zu Teams können Sie zunächst auslassen; es folgt in Schritt 8.
5. Schließen Sie den Dialog und prüfen Sie den App-Eintrag. Der technische Paketname kann `rolealpha-meetings-client-side-solution` lauten.

**Prüfung:** Das Paket wird als aktiviert angezeigt und es erscheint keine Bereitstellungsfehlermeldung. Ein Hinweis auf zusätzliche API-Berechtigungen ist noch kein Installationsfehler; diese werden in Schritt 7 behandelt.

## 5. Die App auf einer SharePoint-Seite anzeigen

Ein **Webpart** ist ein Baustein auf einer SharePoint-Seite. roleALPHA Meetings wird als solcher Baustein eingefügt.

1. Öffnen Sie die Websiteadresse aus Schritt 2.
2. Wählen Sie **Neu → Seite**, legen Sie eine leere Seite an und geben Sie ihr beispielsweise den Namen **Meetings**. Alternativ bearbeiten Sie eine vorhandene geeignete Seite.
3. Klicken Sie im Seiteninhalt auf das **Pluszeichen**, mit dem Sie einen Webpart hinzufügen.
4. Suchen Sie nach **roleALPHA Meetings** und wählen Sie diesen Eintrag. Für die Übersicht verwenden Sie die Mehrzahl „Meetings“; der ähnlich benannte Eintrag „roleALPHA Meeting“ ist für einen einzelnen Meeting-Tab vorgesehen.
5. Öffnen Sie über das Bearbeitungssymbol des Webparts dessen Eigenschaften.
6. Lassen Sie **SharePoint site URL** leer, wenn Sie die gerade geöffnete Website verwenden möchten. Nur für eine andere Website tragen Sie deren vollständige Adresse ein. Diese muss auf demselben SharePoint-Host liegen, beispielsweise ebenfalls unter `ihreorganisation.sharepoint.com`.
7. Lassen Sie im Feld **Meeting** die Auswahl **All meetings / Alle Meetings** stehen.
8. Veröffentlichen Sie die Seite mit **Veröffentlichen** beziehungsweise **Erneut veröffentlichen**.

**Prüfung:** Auf der veröffentlichten Seite erscheint roleALPHA Meetings. Beim ersten Aufruf ist die Aufforderung zur Einrichtung des Arbeitsbereichs erwartbar.

## 6. Den Einrichtungsassistenten durchlaufen

1. Öffnen Sie die App als Websitebesitzer. Bei einem noch nicht eingerichteten Arbeitsbereich erscheint **Willkommen bei rA Meetings**. Bei einer bestehenden Einrichtung öffnen Sie **Verbindungen → Einrichtungsassistent öffnen**.
2. Wählen Sie **Vorhandene SharePoint-Website verwenden**. Tragen Sie die Websiteadresse aus Schritt 2 ein und klicken Sie auf **Website prüfen**. Die App prüft Erreichbarkeit und Ihre Rechte, bevor sie Inhalte anlegt.
3. Wenn Sie stattdessen einen neuen Arbeitsbereich benötigen, wählen Sie **Neue SharePoint-Website erstellen**. Geben Sie einen Namen und einen kurzen Adressnamen aus Buchstaben, Zahlen und Bindestrichen ein. Prüfen Sie die angezeigte Adresse und wählen Sie **Website erstellen**. Falls die Erstellung noch läuft, wählen Sie nach kurzer Zeit **Status prüfen**. Es entsteht eine eigenständige Teamwebsite; kein neues Microsoft-Team. Ihr angemeldetes Konto wird Besitzer. Die Organisationsrichtlinien gelten weiterhin. Bei einer Fehlermeldung lassen Sie die SharePoint-Administration die Websiteerstellung prüfen.
4. Auf **Zugriff und Einstellungen prüfen** öffnen Sie **Websiteberechtigungen öffnen** in einem neuen Tab. Prüfen Sie die vorhandenen Personen und Gruppen. Benötigte Änderungen nehmen Sie bewusst in SharePoint vor. Kehren Sie anschließend zum Assistenten zurück. Er selbst ändert keine Zugriffsrechte.
5. Wählen Sie oben die gewünschte Sprache für neue Startvorlagen und bei Bedarf die Anzeige **Agenda** statt **Spannungen**. Vorhandene Vorlagen werden nicht übersetzt oder überschrieben. Die Anzeigeauswahl gilt persönlich für Ihren Browser.
6. Lassen Sie **Eine eigene Einstiegsseite für rA Meetings vorbereiten** aktiviert, wenn der Assistent eine Seite im gewählten Arbeitsbereich anlegen soll. Eine vorhandene Website-Startseite wird nicht ersetzt. Eine bereits vorhandene, nicht vom Assistenten angelegte Seite mit demselben Dateinamen wird nicht überschrieben. Für einen reinen Teams-Arbeitsbereich können Sie diese Option abwählen.
7. Bestätigen Sie, dass Sie den zugriffsberechtigten Personenkreis geprüft haben, und wählen Sie **Arbeitsbereich einrichten**.
8. Warten Sie auf **Ihr Arbeitsbereich ist bereit**. Die App erstellt Speicherbereiche und Startvorlagen und führt einen Schreib-/Lesetest aus. Bei einem Fehler bleiben bereits erstellte Bestandteile erhalten. Gehen Sie zurück, beheben Sie die Ursache und starten Sie die Einrichtung erneut. Löschen Sie die angelegten Listen nicht als ersten Fehlerbehebungsversuch.
9. Wenn Sie eine Einstiegsseite angefordert haben, wählen Sie **Einstiegsseite prüfen und veröffentlichen**. Prüfen Sie in SharePoint die Seite und wählen Sie **Veröffentlichen**. Erst danach geben Sie deren Link an die Gruppe weiter. Eine gegebenenfalls vorgeschriebene Seitenfreigabe Ihrer Organisation bleibt bestehen.
10. Optional wählen Sie **Kalenderzugriff testen**. Falls Berechtigungen fehlen, führen Sie Schritt 7 aus. Fehlende optionale Verbindungen verhindern nicht die grundlegende Nutzung der Meeting-App. Anzeigen wie „konfiguriert“ ersetzen keine tatsächlichen KI-/roleALPHA-Funktionstests.
11. Wählen Sie **Arbeitsbereich öffnen**. Öffnen Sie **Templates**; dort sollten drei Startvorlagen vorhanden sein. Erstellen Sie anschließend über **Meetings → Meeting anlegen** ein Testmeeting und laden Sie die Seite neu. Das Meeting muss erhalten bleiben.

**Prüfung:** Unter **Zahnrad → Websiteinhalte** der ausgewählten Website finden Sie:

| Name | Zweck |
| --- | --- |
| `rA Meetings Browser Index` | Verzeichnis der gespeicherten Datensätze |
| `rA Meetings Browser Data` | Inhalte und ältere gespeicherte Fassungen |
| `rA-Meetings.aspx` in der Seitenbibliothek, falls ausgewählt | Vorbereitete Einstiegsseite mit der App |

Benennen Sie die Speicherbereiche nicht um. Nach einem Websitewechsel enthält die aktuelle App-Adresse die Arbeitsbereichsauswahl. Für einen dauerhaften Einstieg verwenden Sie vorzugsweise die veröffentlichte Einstiegsseite; bei Teams tragen Sie die ausgewählte Websiteadresse auch in der Registerkartenkonfiguration ein.

## 7. Optional: Kalender und Teams-Transkripte freigeben

Überspringen Sie diesen Schritt, wenn Sie zunächst nur Meetings manuell anlegen und Transkriptdateien importieren möchten.

**Microsoft Graph** ist die Schnittstelle, über die die App Kalender und Transkripte von Microsoft abruft. Die Freigabe erfolgt für angemeldete Benutzer; sie gibt niemandem automatisch Zugriff auf fremde Kalender oder Besprechungen.

1. Öffnen Sie erneut das **SharePoint Admin Center**.
2. Wählen Sie **Erweitert → API-Zugriff / Advanced → API access**.
3. Lassen Sie die für Microsoft-API-Freigaben berechtigte Administration die folgenden Anforderungen des Pakets prüfen:

| Angeforderte Berechtigung | Verwendungszweck |
| --- | --- |
| `Calendars.Read` | Eigene Kalendertermine anzeigen und verknüpfen |
| `OnlineMeetings.Read` | Die verknüpfte Teams-Besprechung finden |
| `OnlineMeetingTranscript.Read.All` | Verfügbare und für den Benutzer zugängliche Transkripte lesen |

4. Genehmigen Sie die benötigten Anforderungen einzeln. Bereits genehmigte Einträge müssen nicht erneut genehmigt werden.
5. Öffnen Sie die App mit einem normalen Testkonto neu. Testen Sie an einem Meeting die Kalenderverknüpfung mit einem eigenen einzelnen Teams-Termin.
6. Prüfen Sie nach einer Testbesprechung mit tatsächlich erstelltem Transkript den Abruf in **Transkript & Analyse**. Teams-Lizenz, Besprechungsrichtlinie und Benutzerzugriff müssen die Transkription und den Abruf erlauben.

**Prüfung:** Kalendertermine werden angezeigt; ein zugängliches Transkript lässt sich abrufen. Die Anzeige „konfiguriert“ allein bestätigt noch keinen erfolgreichen Zugriff. Bei Serienterminen importieren Sie das Transkript der konkreten Durchführung manuell als VTT- oder TXT-Datei.

Diese Freigaben gelten für die gemeinsam verwendete SharePoint-Anmeldekomponente und sind nicht ausschließlich auf diesen Webpart begrenzt. Weitere Informationen: [Microsoft-Anleitung zu API-Freigaben](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/use-aadhttpclient).

## 8. Optional: Die Apps in Teams verfügbar machen

1. Öffnen Sie wieder **Apps verwalten** im SharePoint-App-Katalog.
2. Markieren Sie das roleALPHA-Paket.
3. Wählen Sie **Zu Teams hinzufügen / Add to Teams**. In älteren Ansichten heißt die Aktion **Mit Teams synchronisieren / Sync to Teams**.
4. Warten Sie auf die Bestätigung. Microsoft erzeugt daraus die Teams-App-Einträge; Sie müssen die `.sppkg`-Datei nicht selbst in Teams hochladen.
5. Öffnen Sie das [Teams Admin Center](https://admin.teams.microsoft.com/).
6. Suchen Sie unter **Teams-Apps → Apps verwalten** nach **roleALPHA Meetings** und **roleALPHA Meeting**.
7. Prüfen Sie für beide Einträge, ob sie zugelassen und für Ihre Testpersonen verfügbar sind. Je nach Verwaltungsmodell Ihrer Organisation erfolgt die Zuweisung direkt an der App oder über App-Berechtigungsrichtlinien. Lassen Sie dies gegebenenfalls die Teams-Administration einstellen.
8. Öffnen Sie Teams mit einem Testkonto erneut und suchen Sie im App-Bereich nach **roleALPHA**.

**Prüfung:** Die freigegebenen Apps sind für das Testkonto sichtbar. Die Veröffentlichung und Richtlinienübernahme können verzögert erfolgen. Der [Microsoft-Leitfaden zur Teams-Bereitstellung](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/deployment-spfx-teams-solutions) erklärt die automatische Erzeugung der Einträge.

## 9. Optional: Arbeitsbereich oder einzelnes Meeting in Teams öffnen

### Arbeitsbereich in einem Kanal

1. Öffnen Sie den vorgesehenen Teams-Kanal.
2. Fügen Sie über **+ / Registerkarte hinzufügen** die App **roleALPHA Meetings** hinzu.
3. Tragen Sie im Konfigurationsbereich bei **SharePoint site URL** die Websiteadresse aus Schritt 2 ein. Verwenden Sie bewusst denselben Arbeitsbereich, damit die bereits angelegten Meetings erscheinen.
4. Lassen Sie **Meeting** auf **All meetings / Alle Meetings** und speichern Sie die Konfiguration.
5. Öffnen Sie die neue Registerkarte.

**Prüfung:** Sie sehen das Testmeeting aus Schritt 6. Eine leere Übersicht kann auf eine andere ausgewählte Website hinweisen.

### Ein bestimmtes Meeting in einem Teams-Termin

1. Legen Sie zunächst das gewünschte Meeting in roleALPHA Meetings an.
2. Öffnen Sie einen geplanten Teams-Termin, den Sie bearbeiten dürfen. Falls der Termin gerade neu erstellt wurde, speichern und öffnen Sie ihn erneut.
3. Fügen Sie über die Funktion zum Hinzufügen einer App beziehungsweise Registerkarte **roleALPHA Meeting** hinzu. Die Verfügbarkeit hängt vom Besprechungstyp und den Teams-Richtlinien ab.
4. Tragen Sie dieselbe **SharePoint site URL** ein.
5. Wählen Sie im Feld **Meeting** das zuvor angelegte Meeting anhand seines Namens. Wenn die Liste noch leer ist, warten Sie, bis der Arbeitsbereich geladen ist, und öffnen Sie den Konfigurationsbereich erneut.
6. Speichern Sie und testen Sie den Tab mit einer weiteren berechtigten Person.

**Prüfung:** Der Tab öffnet das ausgewählte Meeting. Ein Kalendertermin fügt diesen Tab nicht automatisch hinzu. Die Teilnahme am Termin ersetzt keine SharePoint-Berechtigung.

## 10. Optional: KI und roleALPHA Governance aktivieren

Die Meeting-App funktioniert auch ohne diese Verbindungen. Im Standardpaket sind beide ausgeschaltet.

1. Entscheiden Sie, ob Sie KI-Unterstützung, die Übergabe an roleALPHA Governance oder beides verwenden möchten.
2. Wenden Sie sich an die für Ihre roleALPHA-Bereitstellung zuständige Person. Fordern Sie ein entsprechend konfiguriertes Installationspaket an. Endanwender müssen keine Serveradressen oder Schlüssel eingeben. Eine Aktivierung allein über die Seite **Verbindungen** ist derzeit nicht vorgesehen.
3. Lassen Sie vorab bestätigen, welche Dienste verwendet werden und wo diese Daten verarbeiten. Für die Vorgabe, dass Inhalte keine Infrastruktur von roleALPHA durchlaufen, darf das Ziel kein zentral betriebener roleALPHA-Dienst sein; die vorgesehene organisationsgebundene Bereitstellung muss diese Vorgabe erfüllen.
4. Die Schnittstellenverantwortlichen müssen die Anmeldung mit Ihrem Microsoft-Konto und direkte Browserzugriffe ermöglichen. Die technische Vorbereitung steht im [separaten technischen Anhang](technical-deployment.md). Ein Dienst, der ausschließlich einen geheimen API-Schlüssel erwartet, ist für diesen Betriebsmodus nicht geeignet.
5. Installieren Sie das angepasste Paket wie unter „Später aktualisieren“ beschrieben und genehmigen Sie gegebenenfalls dessen zusätzliche API-Anforderungen.
6. Prüfen Sie **Verbindungen** in der App. Testen Sie anschließend jede aktivierte Funktion mit Testdaten: einen KI-Vorschlag erzeugen, menschlich prüfen und erst danach ein bestätigtes Ergebnis an roleALPHA übergeben.
7. Kontrollieren Sie in roleALPHA, ob der erwartete Entwurf angelegt wurde.
8. Für Fragen zur bestehenden Governance lassen Sie zusätzlich die roleALPHA-Suchfunktion mit den passenden Leserechten im Paket freigeben. Eine reine Verbindung zum Anlegen von Entwürfen genügt dafür nicht.
9. Öffnen Sie **Governance fragen** in der Navigation oder im Meeting. Stellen Sie eine Testfrage zu einer bekannten Rolle oder Regel und wählen Sie **Governance prüfen**.
10. Vergleichen Sie die Antwort und die aufklappbaren Quelltexte mit der bestehenden Governance in roleALPHA. Testen Sie auch eine Frage ohne passende Quellen: Die App soll dann keine unbelegte Antwort als gesicherte Governance ausgeben.

Die Governance-Hilfe liest ausschließlich über die freigegebene roleALPHA-Suchfunktion. Sie ändert keine Rollen oder Regeln. Die Frage geht an roleALPHA; gefundene Inhalte und Frage werden an den freigegebenen KI-Dienst weitergegeben. Ein Meeting oder Transkript wird nicht automatisch mitgesendet. Fragen und Antworten werden von der Meeting-App nicht dauerhaft gespeichert; für die angebundenen Dienste gelten deren eigene Protokollierungs- und Aufbewahrungseinstellungen.

**Prüfung:** Die konkrete Testaktion funktioniert. Für Governance ist ausschließlich eine roleALPHA-Verbindung vorgesehen; MCP bezeichnet ihr technisches Übertragungsprotokoll, keine Auswahl beliebiger Anbieter.

Bei einer unklaren Exportantwort prüfen Sie zuerst in roleALPHA, ob der Entwurf bereits existiert. Wiederholen Sie den Export nicht ungeprüft. Nach einer unterbrochenen Übertragung kann die App nach fünf Minuten einen manuellen Abgleich ermöglichen.

## 11. Installation mit normalen Benutzerkonten prüfen

Führen Sie diese Prüfungen durch, bevor Sie den Link an die gesamte Gruppe verteilen:

- [ ] Eine Person mit Bearbeitungsrechten kann ein Meeting anlegen und nach dem Neuladen wieder öffnen.
- [ ] Eine zweite berechtigte Person sieht dasselbe Meeting im selben Arbeitsbereich.
- [ ] Eine Person mit ausschließlichen Leserechten kann Inhalte ansehen, aber nicht bearbeiten.
- [ ] Eine Person ohne Websitezugriff erhält keinen Zugriff auf die Meetingdaten.
- [ ] Unter **Templates** lassen sich Vorlagen mit einem Bearbeitungskonto ändern.
- [ ] Deutsch, Englisch, Französisch und Spanisch sowie die Begriffswahl „Spannungen/Agenda“ funktionieren.
- [ ] Soweit eingerichtet: Teams-Tab, Kalender, Transkriptabruf, KI und roleALPHA-Übertragung wurden jeweils tatsächlich getestet.
- [ ] Die Zuständigkeit für Berechtigungen, Aufbewahrung und Wiederherstellung ist dokumentiert.

**Prüfung:** Erst nach den erfolgreichen Tests veröffentlichen Sie den Seitenlink beziehungsweise die Teams-Registerkarte für die vorgesehene Gruppe.

## Wenn etwas nicht funktioniert

| Beobachtung | Nächster Schritt |
| --- | --- |
| „Apps“ oder „API-Zugriff“ fehlt in der Verwaltung | Konto und Administrationsrolle prüfen; bei fehlendem App-Katalog Schritt 3 abschließen lassen. |
| Der Webpart fehlt beim Einfügen | Im App-Katalog die Aktivierung und Verfügbarkeit für Websites prüfen; anschließend die Seite neu öffnen. |
| „Arbeitsbereich einrichten“ wird nicht angeboten | Websiteadresse prüfen und mit einem Websitebesitzer öffnen, der Listen verwalten darf. |
| „Zugriff verweigert“ | Zugriff auf die Website sowie beide Speicherbereiche aus Schritt 6 prüfen. Eine Teams-Mitgliedschaft allein reicht nicht in jedem Fall. |
| SharePoint zeigt Meetings, Teams aber nicht | Die konfigurierte Websiteadresse in beiden Ansichten vergleichen. |
| App fehlt in Teams | Teams-Synchronisierung, App-Zulassung und Benutzerzuweisung aus Schritt 8 prüfen. |
| Kalender oder Transkript nicht verfügbar | API-Freigabe, verwendetes Benutzerkonto, Terminart und tatsächliche Transkriptverfügbarkeit aus Schritt 7 prüfen. |
| Gleichzeitige Bearbeitung führt zu einem Konflikt | Ungespeicherten Text sichern, aktuellen Stand laden und die Änderung erneut eintragen. |
| KI oder roleALPHA schlägt trotz „konfiguriert“ fehl | Zuständige Schnittstellenadministration mit Zeitpunkt und Fehlermeldung informieren; Anmeldung und erlaubte Browserzugriffe prüfen lassen. Keine geheimen Schlüssel per Nachricht versenden. |

## Laufender Betrieb und Datenaufbewahrung

Die App verarbeitet nur während ihrer Verwendung Daten. Kalenderabruf, Transkriptimport, KI-Aufrufe und Übergaben werden bewusst ausgelöst. Bei geschlossenem Tab läuft keine automatische Nachbearbeitung. Power Automate wird nicht benötigt und nicht mitinstalliert.

Legen Sie für **beide** Speicherbereiche aus Schritt 6 die Aufbewahrung und Wiederherstellung nach den Regeln Ihrer Organisation fest. Ältere und nicht mehr referenzierte Inhaltsdateien werden derzeit nicht automatisch bereinigt. Das Löschen eines Eintrags in der Oberfläche bedeutet deshalb nicht, dass alle historischen Inhalte endgültig gelöscht sind. Lassen Sie eine Wiederherstellung von Liste und Bibliothek gemeinsam testen.

Falls Sie zuvor einen älteren Prototyp betrieben haben: Dessen Daten werden nicht automatisch übernommen. Lassen Sie eine Übernahme mit den zuständigen Personen planen, insbesondere wegen des gemeinsamen Leserechts im neuen Arbeitsbereich.

## Später aktualisieren

1. Lassen Sie sich das neue Paket mit erhöhter Versionsnummer und einer Beschreibung der Änderungen bereitstellen.
2. Stellen Sie sicher, dass die vorhandenen Speicherbereiche nach Ihrem Sicherungsverfahren wiederherstellbar sind.
3. Laden Sie das neue Paket in denselben App-Katalog hoch und bestätigen Sie das Ersetzen des vorhandenen Pakets.
4. Prüfen Sie, ob neue API-Berechtigungen angefordert werden, und lassen Sie diese bei Bedarf genehmigen.
5. Wiederholen Sie für Teams die Aktion **Zu Teams hinzufügen / Mit Teams synchronisieren** und kontrollieren Sie den Status.
6. Öffnen Sie die App neu und wiederholen Sie die relevanten Tests aus Schritt 11.

Löschen oder erstellen Sie den Arbeitsbereich bei einem gewöhnlichen Paketupdate nicht neu. Für das Erstellen des Pakets und die Schnittstellenkonfiguration gibt es den [technischen Anhang](technical-deployment.md); diese Arbeiten gehören nicht zur Installation durch Endanwender.
